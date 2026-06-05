package billing_setting

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseImageBillingRulesAllowsBlankResolutionNumericDrafts(t *testing.T) {
	rules, err := ParseImageBillingRulesJSON(`{
		"image-test": {
			"enabled": true,
			"resolution_tiers": [
				{
					"name": "2K",
					"max_long_edge": "",
					"max_pixels": "4194304",
					"ratio": "2"
				}
			]
		}
	}`)

	require.NoError(t, err)
	tier := rules["image-test"].ResolutionTiers[0]
	require.Equal(t, 0, tier.MaxLongEdge)
	require.Equal(t, 4194304, tier.MaxPixels)
	require.Equal(t, 2.0, tier.Ratio)
}

func TestParseImageBillingRulesValidatesBlankResolutionThresholds(t *testing.T) {
	_, err := ParseImageBillingRulesJSON(`{
		"image-test": {
			"enabled": true,
			"resolution_tiers": [
				{
					"name": "2K",
					"max_long_edge": "",
					"max_pixels": "",
					"ratio": "2"
				}
			]
		}
	}`)

	require.Error(t, err)
	require.Contains(t, err.Error(), "needs max_long_edge or max_pixels")
}
