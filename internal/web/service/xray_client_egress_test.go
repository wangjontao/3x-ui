package service

import (
	"encoding/json"
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
	"github.com/mhsanaei/3x-ui/v3/internal/util/json_util"
	"github.com/mhsanaei/3x-ui/v3/internal/xray"
)

func TestInjectClientEgressOutbound(t *testing.T) {
	cfg := &xray.Config{
		OutboundConfigs: json_util.RawMessage(`[{"tag":"socks-us","protocol":"socks","settings":{}}]`),
		RouterConfig:    json_util.RawMessage(`{"domainStrategy":"AsIs","rules":[{"type":"field","domain":["example.com"],"outboundTag":"direct"}]}`),
	}
	injectClientEgress(cfg, []model.ClientRecord{
		{Email: "alice@example.com", Enable: true, OutboundTag: "socks-us"},
		{Email: "bob@example.com", Enable: true, OutboundTag: "missing"},
		{Email: "off@example.com", Enable: false, OutboundTag: "socks-us"},
	})

	var routing map[string]any
	if err := json.Unmarshal(cfg.RouterConfig, &routing); err != nil {
		t.Fatal(err)
	}
	rules, _ := routing["rules"].([]any)
	if len(rules) != 2 {
		t.Fatalf("expected generated rule + existing rule, got %d", len(rules))
	}
	first, _ := rules[0].(map[string]any)
	if got := first["outboundTag"]; got != "socks-us" {
		t.Fatalf("outboundTag = %v", got)
	}
	users, _ := first["user"].([]any)
	if len(users) != 1 || users[0] != "alice@example.com" {
		t.Fatalf("user match = %#v", users)
	}
}

func TestInjectClientEgressBalancer(t *testing.T) {
	cfg := &xray.Config{
		OutboundConfigs: json_util.RawMessage(`[]`),
		RouterConfig:    json_util.RawMessage(`{"balancers":[{"tag":"landing-pool","selector":["proxy-"]}],"rules":[]}`),
	}
	injectClientEgress(cfg, []model.ClientRecord{
		{Email: "alice@example.com", Enable: true, OutboundTag: "landing-pool"},
	})

	var routing map[string]any
	if err := json.Unmarshal(cfg.RouterConfig, &routing); err != nil {
		t.Fatal(err)
	}
	rules, _ := routing["rules"].([]any)
	if len(rules) != 1 {
		t.Fatalf("expected one generated rule, got %d", len(rules))
	}
	first, _ := rules[0].(map[string]any)
	if got := first["balancerTag"]; got != "landing-pool" {
		t.Fatalf("balancerTag = %v", got)
	}
	if _, exists := first["outboundTag"]; exists {
		t.Fatal("balancer rule must not also carry outboundTag")
	}
}
