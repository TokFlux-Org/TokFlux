package common

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
)

func TestIsImageGenerationModelRecognizesGptImageSeries(t *testing.T) {
	for _, modelName := range []string{
		"gpt-image-1",
		"gpt-image-1-mini",
		"gpt-image-2",
		"gpt-image-2-2026-04-21",
		"chatgpt-image-latest",
	} {
		if !IsImageGenerationModel(modelName) {
			t.Fatalf("expected %q to be recognized as an image generation model", modelName)
		}
	}
}

func TestGetEndpointTypesByChannelTypeUsesOnlyImageGenerationForGptImage2(t *testing.T) {
	endpoints := GetEndpointTypesByChannelType(constant.ChannelTypeOpenAI, "gpt-image-2")
	if len(endpoints) != 1 {
		t.Fatalf("expected one endpoint type, got %d: %v", len(endpoints), endpoints)
	}
	if endpoints[0] != constant.EndpointTypeImageGeneration {
		t.Fatalf("expected image generation endpoint first, got %q", endpoints[0])
	}
}

func TestWanEndpointsDistinguishImagesFromVideos(t *testing.T) {
	for _, name := range []string{
		"wan2.7-image-pro", "wan2.7-image", "wan2.6-image", "wan2.6-t2i",
		"wan2.5-t2i-preview", "wan2.2-t2i-flash", "wan2.2-t2i-plus",
		"wanx2.1-t2i-turbo", "wanx2.1-t2i-plus", "wanx2.0-t2i-turbo",
	} {
		t.Run(name, func(t *testing.T) {
			if !containsEndpoint(GetEndpointTypesByChannelType(constant.ChannelTypeAli, name), constant.EndpointTypeImageGeneration) {
				t.Fatalf("expected image endpoint for %q", name)
			}
		})
	}
	for _, name := range []string{
		"wanx2.1-t2v-plus", "wanx2.1-t2v-turbo", "wanx2.1-i2v-plus", "wanx2.1-i2v-turbo",
	} {
		t.Run(name, func(t *testing.T) {
			if containsEndpoint(GetEndpointTypesByChannelType(constant.ChannelTypeAli, name), constant.EndpointTypeImageGeneration) {
				t.Fatalf("did not expect image endpoint for %q", name)
			}
		})
	}
}

func containsEndpoint(endpoints []constant.EndpointType, want constant.EndpointType) bool {
	for _, endpoint := range endpoints {
		if endpoint == want {
			return true
		}
	}
	return false
}
