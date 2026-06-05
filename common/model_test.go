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
