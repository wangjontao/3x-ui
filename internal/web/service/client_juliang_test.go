package service

import (
	"testing"

	"github.com/mhsanaei/3x-ui/v3/internal/database/model"
)

func TestClientWithInboundFlowStripsPanelOutboundTag(t *testing.T) {
	client := model.Client{
		Email:       "alice@example.com",
		OutboundTag: "socks-us",
	}
	inbound := &model.Inbound{Protocol: model.VLESS}
	got := clientWithInboundFlow(client, inbound)
	if got.OutboundTag != "" {
		t.Fatalf("panel-only outboundTag leaked into Xray client JSON: %q", got.OutboundTag)
	}
	if client.OutboundTag != "socks-us" {
		t.Fatal("clientWithInboundFlow mutated the caller's client value")
	}
}
