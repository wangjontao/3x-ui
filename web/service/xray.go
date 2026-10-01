package service

import (
	"encoding/json"
	"errors"
	"runtime"
	"strings"
	"sync"

	"github.com/mhsanaei/3x-ui/v2/logger"
	"github.com/mhsanaei/3x-ui/v2/xray"

	"go.uber.org/atomic"
)

var (
	p                 *xray.Process
	lock              sync.Mutex
	isNeedXrayRestart atomic.Bool // Indicates that restart was requested for Xray
	isManuallyStopped atomic.Bool // Indicates that Xray was stopped manually from the panel
	result            string
)

// XrayService provides business logic for Xray process management.
// It handles starting, stopping, restarting Xray, and managing its configuration.
type XrayService struct {
	inboundService InboundService
	settingService SettingService
	xrayAPI        xray.XrayAPI
}

// IsXrayRunning checks if the Xray process is currently running.
func (s *XrayService) IsXrayRunning() bool {
	return p != nil && p.IsRunning()
}

// GetXrayErr returns the error from the Xray process, if any.
func (s *XrayService) GetXrayErr() error {
	if p == nil {
		return nil
	}

	err := p.GetErr()
	if err == nil {
		return nil
	}

	if runtime.GOOS == "windows" && err.Error() == "exit status 1" {
		// exit status 1 on Windows means that Xray process was killed
		// as we kill process to stop in on Windows, this is not an error
		return nil
	}

	return err
}

// GetXrayResult returns the result string from the Xray process.
func (s *XrayService) GetXrayResult() string {
	if result != "" {
		return result
	}
	if s.IsXrayRunning() {
		return ""
	}
	if p == nil {
		return ""
	}

	result = p.GetResult()

	if runtime.GOOS == "windows" && result == "exit status 1" {
		// exit status 1 on Windows means that Xray process was killed
		// as we kill process to stop in on Windows, this is not an error
		return ""
	}

	return result
}

// GetXrayVersion returns the version of the running Xray process.
func (s *XrayService) GetXrayVersion() string {
	if p == nil {
		return "Unknown"
	}
	return p.GetVersion()
}

// RemoveIndex removes an element at the specified index from a slice.
// Returns a new slice with the element removed.
func RemoveIndex(s []any, index int) []any {
	return append(s[:index], s[index+1:]...)
}

// GetXrayConfig retrieves and builds the Xray configuration from settings and inbounds.
func (s *XrayService) GetXrayConfig() (*xray.Config, error) {
	templateConfig, err := s.settingService.GetXrayConfigTemplate()
	if err != nil {
		return nil, err
	}

	xrayConfig := &xray.Config{}
	err = json.Unmarshal([]byte(templateConfig), xrayConfig)
	if err != nil {
		return nil, err
	}

	s.inboundService.AddTraffic(nil, nil)

	inbounds, err := s.inboundService.GetAllInbounds()
	if err != nil {
		return nil, err
	}
	clientEgress := make(map[string][]string)
	for _, inbound := range inbounds {
		if !inbound.Enable {
			continue
		}
		// get settings clients
		settings := map[string]any{}
		json.Unmarshal([]byte(inbound.Settings), &settings)
		clients, ok := settings["clients"].([]any)
		if ok {
			// Fast O(N) lookup map for client traffic enablement
			clientStats := inbound.ClientStats
			enableMap := make(map[string]bool, len(clientStats))
			for _, clientTraffic := range clientStats {
				enableMap[clientTraffic.Email] = clientTraffic.Enable
			}

			// filter and clean clients
			var final_clients []any
			for _, client := range clients {
				c, ok := client.(map[string]any)
				if !ok {
					continue
				}

				email, _ := c["email"].(string)

				// check users active or not via stats
				if enable, exists := enableMap[email]; exists && !enable {
					logger.Infof("Remove Inbound User %s due to expiration or traffic limit", email)
					continue
				}

				// check manual disabled flag
				if manualEnable, ok := c["enable"].(bool); ok && !manualEnable {
					continue
				}

				// JuLiang: outboundTag is panel-only metadata. Remember it for
				// runtime user routing, then let the normal cleanup strip it
				// before the client object reaches Xray.
				if outboundTag, ok := c["outboundTag"].(string); ok {
					outboundTag = strings.TrimSpace(outboundTag)
					if outboundTag != "" && strings.TrimSpace(email) != "" {
						clientEgress[outboundTag] = append(clientEgress[outboundTag], email)
					}
				}

				// clear client config for additional parameters
				for key := range c {
					if key != "email" && key != "id" && key != "password" && key != "flow" && key != "method" && key != "auth" {
						delete(c, key)
					}
					if flow, ok := c["flow"].(string); ok && flow == "xtls-rprx-vision-udp443" {
						c["flow"] = "xtls-rprx-vision"
					}
				}
				final_clients = append(final_clients, any(c))
			}

			settings["clients"] = final_clients
			modifiedSettings, err := json.MarshalIndent(settings, "", "  ")
			if err != nil {
				return nil, err
			}

			inbound.Settings = string(modifiedSettings)
		}

		if len(inbound.StreamSettings) > 0 {
			// Unmarshal stream JSON
			var stream map[string]any
			json.Unmarshal([]byte(inbound.StreamSettings), &stream)

			// Remove the "settings" field under "tlsSettings" and "realitySettings"
			tlsSettings, ok1 := stream["tlsSettings"].(map[string]any)
			realitySettings, ok2 := stream["realitySettings"].(map[string]any)
			if ok1 || ok2 {
				if ok1 {
					delete(tlsSettings, "settings")
				} else if ok2 {
					delete(realitySettings, "settings")
				}
			}

			delete(stream, "externalProxy")

			newStream, err := json.MarshalIndent(stream, "", "  ")
			if err != nil {
				return nil, err
			}
			inbound.StreamSettings = string(newStream)
		}

		inboundConfig := inbound.GenXrayInboundConfig()
		xrayConfig.InboundConfigs = append(xrayConfig.InboundConfigs, *inboundConfig)
	}
	injectClientEgress(xrayConfig, clientEgress)
	return xrayConfig, nil
}

const juliangSK5RulePrefix = "juliang-sk5:"

func injectClientEgress(cfg *xray.Config, usersByTag map[string][]string) {
	routing := map[string]any{}
	if len(cfg.RouterConfig) > 0 {
		if err := json.Unmarshal(cfg.RouterConfig, &routing); err != nil {
			logger.Warning("JuLiang client egress: invalid routing config:", err)
			return
		}
	}
	rules, _ := routing["rules"].([]any)

	validOutbounds := map[string]bool{}
	var outbounds []map[string]any
	if err := json.Unmarshal(cfg.OutboundConfigs, &outbounds); err == nil {
		for _, outbound := range outbounds {
			if tag, ok := outbound["tag"].(string); ok && strings.TrimSpace(tag) != "" {
				validOutbounds[strings.TrimSpace(tag)] = true
			}
		}
	}
	validBalancers := map[string]bool{}
	if balancers, ok := routing["balancers"].([]any); ok {
		for _, raw := range balancers {
			if balancer, ok := raw.(map[string]any); ok {
				if tag, ok := balancer["tag"].(string); ok && strings.TrimSpace(tag) != "" {
					validBalancers[strings.TrimSpace(tag)] = true
				}
			}
		}
	}
	targetExists := func(tag string) bool { return validOutbounds[tag] || validBalancers[tag] }

	// Deduplicate enabled client emails per target.
	for tag, users := range usersByTag {
		seen := map[string]bool{}
		clean := make([]string, 0, len(users))
		for _, user := range users {
			user = strings.TrimSpace(user)
			if user != "" && !seen[user] {
				seen[user] = true
				clean = append(clean, user)
			}
		}
		usersByTag[tag] = clean
	}

	managedUsed := map[string]bool{}
	cleanedRules := make([]any, 0, len(rules))
	for _, raw := range rules {
		rule, ok := raw.(map[string]any)
		if !ok {
			cleanedRules = append(cleanedRules, raw)
			continue
		}
		ruleTag, _ := rule["ruleTag"].(string)
		if !strings.HasPrefix(ruleTag, juliangSK5RulePrefix) {
			cleanedRules = append(cleanedRules, raw)
			continue
		}
		target := strings.TrimSpace(strings.TrimPrefix(ruleTag, juliangSK5RulePrefix))
		if !targetExists(target) {
			continue
		}

		runtimeRule := make(map[string]any, len(rule))
		for key, value := range rule {
			if key == "ruleTag" || key == "comment" || key == "enabled" {
				continue
			}
			runtimeRule[key] = value
		}
		delete(runtimeRule, "outboundTag")
		delete(runtimeRule, "balancerTag")
		if users := usersByTag[target]; len(users) > 0 {
			runtimeRule["user"] = users
			managedUsed[target] = true
		} else {
			runtimeRule["user"] = []string{"__juliang_tk_unassigned__:" + target}
		}
		if validBalancers[target] {
			runtimeRule["balancerTag"] = target
		} else {
			runtimeRule["outboundTag"] = target
		}
		cleanedRules = append(cleanedRules, runtimeRule)
	}

	generated := make([]any, 0)
	for tag, users := range usersByTag {
		if managedUsed[tag] || len(users) == 0 || !targetExists(tag) {
			continue
		}
		rule := map[string]any{"type": "field", "user": users}
		if validBalancers[tag] {
			rule["balancerTag"] = tag
		} else {
			rule["outboundTag"] = tag
		}
		generated = append(generated, rule)
	}
	routing["rules"] = append(generated, cleanedRules...)
	newRouting, err := json.Marshal(routing)
	if err != nil {
		logger.Warning("JuLiang client egress: rebuild routing failed:", err)
		return
	}
	cfg.RouterConfig = newRouting
}

// GetXrayTraffic fetches the current traffic statistics from the running Xray process.
func (s *XrayService) GetXrayTraffic() ([]*xray.Traffic, []*xray.ClientTraffic, error) {
	if !s.IsXrayRunning() {
		err := errors.New("xray is not running")
		logger.Debug("Attempted to fetch Xray traffic, but Xray is not running:", err)
		return nil, nil, err
	}
	apiPort := p.GetAPIPort()
	if err := s.xrayAPI.Init(apiPort); err != nil {
		logger.Debug("Failed to initialize Xray API:", err)
		return nil, nil, err
	}
	defer s.xrayAPI.Close()

	traffic, clientTraffic, err := s.xrayAPI.GetTraffic(true)
	if err != nil {
		logger.Debug("Failed to fetch Xray traffic:", err)
		return nil, nil, err
	}
	return traffic, clientTraffic, nil
}

// RestartXray restarts the Xray process, optionally forcing a restart even if config unchanged.
func (s *XrayService) RestartXray(isForce bool) error {
	lock.Lock()
	defer lock.Unlock()
	logger.Debug("restart Xray, force:", isForce)
	isManuallyStopped.Store(false)

	xrayConfig, err := s.GetXrayConfig()
	if err != nil {
		return err
	}

	if s.IsXrayRunning() {
		if !isForce && p.GetConfig().Equals(xrayConfig) && !isNeedXrayRestart.Load() {
			logger.Debug("It does not need to restart Xray")
			return nil
		}
		p.Stop()
	}

	p = xray.NewProcess(xrayConfig)
	result = ""
	err = p.Start()
	if err != nil {
		return err
	}

	return nil
}

// StopXray stops the running Xray process.
func (s *XrayService) StopXray() error {
	lock.Lock()
	defer lock.Unlock()
	isManuallyStopped.Store(true)
	logger.Debug("Attempting to stop Xray...")
	if s.IsXrayRunning() {
		return p.Stop()
	}
	return errors.New("xray is not running")
}

// SetToNeedRestart marks that Xray needs to be restarted.
func (s *XrayService) SetToNeedRestart() {
	isNeedXrayRestart.Store(true)
}

// IsNeedRestartAndSetFalse checks if restart is needed and resets the flag to false.
func (s *XrayService) IsNeedRestartAndSetFalse() bool {
	return isNeedXrayRestart.CompareAndSwap(true, false)
}

// DidXrayCrash checks if Xray crashed by verifying it's not running and wasn't manually stopped.
func (s *XrayService) DidXrayCrash() bool {
	return !s.IsXrayRunning() && !isManuallyStopped.Load()
}
