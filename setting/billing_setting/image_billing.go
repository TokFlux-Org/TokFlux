package billing_setting

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

const (
	ImageBillingMatchExact    = "exact"
	ImageBillingMatchPrefix   = "prefix"
	ImageBillingMatchSuffix   = "suffix"
	ImageBillingMatchContains = "contains"

	ImageBillingUnknownDefault = "default"
	ImageBillingUnknownBase    = "base"
	ImageBillingUnknownHighest = "highest"
	ImageBillingUnknownReject  = "reject"
)

type ImageBillingRule struct {
	Enabled         bool                         `json:"enabled"`
	MatchType       string                       `json:"match_type,omitempty"`
	Source          string                       `json:"source,omitempty"`
	Description     string                       `json:"description,omitempty"`
	SizePath        string                       `json:"size_path,omitempty"`
	SizeTierPath    string                       `json:"size_tier_path,omitempty"`
	DefaultSize     string                       `json:"default_size,omitempty"`
	QualityPath     string                       `json:"quality_path,omitempty"`
	DefaultQuality  string                       `json:"default_quality,omitempty"`
	UnknownPolicy   string                       `json:"unknown_policy,omitempty"`
	SizeRatios      map[string]float64           `json:"size_ratios,omitempty"`
	QualityRatios   map[string]float64           `json:"quality_ratios,omitempty"`
	ResolutionTiers []ImageBillingResolutionTier `json:"resolution_tiers,omitempty"`
}

func (rule *ImageBillingRule) UnmarshalJSON(data []byte) error {
	type RawImageBillingRule struct {
		Enabled         bool                         `json:"enabled"`
		MatchType       string                       `json:"match_type,omitempty"`
		Source          string                       `json:"source,omitempty"`
		Description     string                       `json:"description,omitempty"`
		SizePath        string                       `json:"size_path,omitempty"`
		SizeTierPath    string                       `json:"size_tier_path,omitempty"`
		DefaultSize     string                       `json:"default_size,omitempty"`
		QualityPath     string                       `json:"quality_path,omitempty"`
		DefaultQuality  string                       `json:"default_quality,omitempty"`
		UnknownPolicy   string                       `json:"unknown_policy,omitempty"`
		SizeRatios      map[string]any               `json:"size_ratios,omitempty"`
		QualityRatios   map[string]any               `json:"quality_ratios,omitempty"`
		ResolutionTiers []ImageBillingResolutionTier `json:"resolution_tiers,omitempty"`
	}

	var raw RawImageBillingRule
	if err := common.Unmarshal(data, &raw); err != nil {
		return err
	}

	sizeRatios, err := parseImageBillingRatioMap(raw.SizeRatios, "size_ratios")
	if err != nil {
		return err
	}
	qualityRatios, err := parseImageBillingRatioMap(raw.QualityRatios, "quality_ratios")
	if err != nil {
		return err
	}

	*rule = ImageBillingRule{
		Enabled:         raw.Enabled,
		MatchType:       raw.MatchType,
		Source:          raw.Source,
		Description:     raw.Description,
		SizePath:        raw.SizePath,
		SizeTierPath:    raw.SizeTierPath,
		DefaultSize:     raw.DefaultSize,
		QualityPath:     raw.QualityPath,
		DefaultQuality:  raw.DefaultQuality,
		UnknownPolicy:   raw.UnknownPolicy,
		SizeRatios:      sizeRatios,
		QualityRatios:   qualityRatios,
		ResolutionTiers: raw.ResolutionTiers,
	}
	return nil
}

type ImageBillingResolutionTier struct {
	Name        string  `json:"name"`
	MaxLongEdge int     `json:"max_long_edge,omitempty"`
	MaxPixels   int     `json:"max_pixels,omitempty"`
	Ratio       float64 `json:"ratio"`
}

func (tier *ImageBillingResolutionTier) UnmarshalJSON(data []byte) error {
	var raw struct {
		Name        string `json:"name"`
		MaxLongEdge any    `json:"max_long_edge,omitempty"`
		MaxPixels   any    `json:"max_pixels,omitempty"`
		Ratio       any    `json:"ratio"`
	}
	if err := common.Unmarshal(data, &raw); err != nil {
		return err
	}

	maxLongEdge, err := parseImageBillingOptionalInt(raw.MaxLongEdge, "max_long_edge")
	if err != nil {
		return err
	}
	maxPixels, err := parseImageBillingOptionalInt(raw.MaxPixels, "max_pixels")
	if err != nil {
		return err
	}
	ratio, err := parseImageBillingOptionalFloat(raw.Ratio, "ratio")
	if err != nil {
		return err
	}

	*tier = ImageBillingResolutionTier{
		Name:        raw.Name,
		MaxLongEdge: maxLongEdge,
		MaxPixels:   maxPixels,
		Ratio:       ratio,
	}
	return nil
}

type ImageBillingRuleView struct {
	ImageBillingRule
	MatchPattern string `json:"match_pattern,omitempty"`
}

func GetImageBillingRulesCopy() map[string]ImageBillingRule {
	return cloneImageBillingRules(billingSetting.ImageBillingRules)
}

func GetImageBillingRule(modelName string) (ImageBillingRule, string, bool) {
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		return ImageBillingRule{}, "", false
	}

	if rule, ok := billingSetting.ImageBillingRules[modelName]; ok {
		if rule.Enabled && matchImageBillingPattern(modelName, modelName, rule.MatchType) {
			return cloneImageBillingRule(rule), modelName, true
		}
	}

	patterns := make([]string, 0, len(billingSetting.ImageBillingRules))
	for pattern := range billingSetting.ImageBillingRules {
		if pattern == modelName {
			continue
		}
		patterns = append(patterns, pattern)
	}
	sort.Slice(patterns, func(i, j int) bool {
		if len(patterns[i]) == len(patterns[j]) {
			return patterns[i] < patterns[j]
		}
		return len(patterns[i]) > len(patterns[j])
	})

	for _, pattern := range patterns {
		rule := billingSetting.ImageBillingRules[pattern]
		if !rule.Enabled {
			continue
		}
		if matchImageBillingPattern(pattern, modelName, rule.MatchType) {
			return cloneImageBillingRule(rule), pattern, true
		}
	}

	return ImageBillingRule{}, "", false
}

func GetImageBillingRuleView(modelName string) (*ImageBillingRuleView, bool) {
	rule, pattern, ok := GetImageBillingRule(modelName)
	if !ok {
		return nil, false
	}
	return &ImageBillingRuleView{
		ImageBillingRule: rule,
		MatchPattern:     pattern,
	}, true
}

func HasImageBillingRule(modelName string) bool {
	_, _, ok := GetImageBillingRule(modelName)
	return ok
}

func UpdateImageBillingRulesByJSONString(jsonStr string) error {
	rules, err := ParseImageBillingRulesJSON(jsonStr)
	if err != nil {
		return err
	}
	billingSetting.ImageBillingRules = rules
	return nil
}

func ParseImageBillingRulesJSON(jsonStr string) (map[string]ImageBillingRule, error) {
	jsonStr = strings.TrimSpace(jsonStr)
	if jsonStr == "" {
		jsonStr = "{}"
	}
	var rules map[string]ImageBillingRule
	if err := common.UnmarshalJsonStr(jsonStr, &rules); err != nil {
		return nil, err
	}
	if rules == nil {
		rules = map[string]ImageBillingRule{}
	}
	if err := ValidateImageBillingRules(rules); err != nil {
		return nil, err
	}
	return cloneImageBillingRules(rules), nil
}

func ValidateImageBillingRules(rules map[string]ImageBillingRule) error {
	for pattern, rule := range rules {
		pattern = strings.TrimSpace(pattern)
		if pattern == "" {
			return fmt.Errorf("image billing rule pattern cannot be empty")
		}
		if err := validateImageBillingRule(pattern, rule); err != nil {
			return err
		}
	}
	return nil
}

func validateImageBillingRule(pattern string, rule ImageBillingRule) error {
	matchType := normalizeImageBillingMatchType(rule.MatchType)
	switch matchType {
	case ImageBillingMatchExact, ImageBillingMatchPrefix, ImageBillingMatchSuffix, ImageBillingMatchContains:
	default:
		return fmt.Errorf("image billing rule %s has invalid match_type: %s", pattern, rule.MatchType)
	}

	policy := normalizeImageBillingUnknownPolicy(rule.UnknownPolicy)
	switch policy {
	case ImageBillingUnknownDefault, ImageBillingUnknownBase, ImageBillingUnknownHighest, ImageBillingUnknownReject:
	default:
		return fmt.Errorf("image billing rule %s has invalid unknown_policy: %s", pattern, rule.UnknownPolicy)
	}

	for name, ratio := range rule.SizeRatios {
		if strings.TrimSpace(name) == "" {
			return fmt.Errorf("image billing rule %s has empty size ratio key", pattern)
		}
		if ratio <= 0 {
			return fmt.Errorf("image billing rule %s size ratio %s must be positive", pattern, name)
		}
	}
	for name, ratio := range rule.QualityRatios {
		if strings.TrimSpace(name) == "" {
			return fmt.Errorf("image billing rule %s has empty quality ratio key", pattern)
		}
		if ratio <= 0 {
			return fmt.Errorf("image billing rule %s quality ratio %s must be positive", pattern, name)
		}
	}
	for _, tier := range rule.ResolutionTiers {
		if strings.TrimSpace(tier.Name) == "" {
			return fmt.Errorf("image billing rule %s has resolution tier without name", pattern)
		}
		if tier.Ratio <= 0 {
			return fmt.Errorf("image billing rule %s resolution tier %s ratio must be positive", pattern, tier.Name)
		}
		if tier.MaxLongEdge <= 0 && tier.MaxPixels <= 0 {
			return fmt.Errorf("image billing rule %s resolution tier %s needs max_long_edge or max_pixels", pattern, tier.Name)
		}
	}
	return nil
}

func matchImageBillingPattern(pattern, modelName, matchType string) bool {
	pattern = strings.TrimSpace(pattern)
	modelName = strings.TrimSpace(modelName)
	switch normalizeImageBillingMatchType(matchType) {
	case ImageBillingMatchPrefix:
		return strings.HasPrefix(modelName, pattern)
	case ImageBillingMatchSuffix:
		return strings.HasSuffix(modelName, pattern)
	case ImageBillingMatchContains:
		return strings.Contains(modelName, pattern)
	default:
		if strings.HasSuffix(pattern, "*") && len(pattern) > 1 {
			return strings.HasPrefix(modelName, strings.TrimSuffix(pattern, "*"))
		}
		if strings.HasPrefix(pattern, "*") && len(pattern) > 1 {
			return strings.HasSuffix(modelName, strings.TrimPrefix(pattern, "*"))
		}
		return modelName == pattern
	}
}

func normalizeImageBillingMatchType(matchType string) string {
	matchType = strings.ToLower(strings.TrimSpace(matchType))
	if matchType == "" {
		return ImageBillingMatchExact
	}
	return matchType
}

func normalizeImageBillingUnknownPolicy(policy string) string {
	policy = strings.ToLower(strings.TrimSpace(policy))
	if policy == "" {
		return ImageBillingUnknownDefault
	}
	return policy
}

func parseImageBillingRatioMap(values map[string]any, field string) (map[string]float64, error) {
	if len(values) == 0 {
		return nil, nil
	}
	ratios := make(map[string]float64, len(values))
	for key, value := range values {
		ratio, err := parseImageBillingOptionalFloat(value, fmt.Sprintf("%s.%s", field, key))
		if err != nil {
			return nil, err
		}
		ratios[key] = ratio
	}
	return ratios, nil
}

func parseImageBillingOptionalInt(value any, field string) (int, error) {
	number, ok, err := parseImageBillingOptionalNumber(value, field)
	if err != nil || !ok {
		return 0, err
	}
	if math.Trunc(number) != number {
		return 0, fmt.Errorf("image billing field %s must be an integer", field)
	}
	maxInt := int(^uint(0) >> 1)
	if number > float64(maxInt) {
		return 0, fmt.Errorf("image billing field %s is too large", field)
	}
	return int(number), nil
}

func parseImageBillingOptionalFloat(value any, field string) (float64, error) {
	number, _, err := parseImageBillingOptionalNumber(value, field)
	return number, err
}

func parseImageBillingOptionalNumber(value any, field string) (float64, bool, error) {
	var number float64
	switch typed := value.(type) {
	case nil:
		return 0, false, nil
	case string:
		typed = strings.TrimSpace(typed)
		if typed == "" {
			return 0, false, nil
		}
		parsed, err := strconv.ParseFloat(typed, 64)
		if err != nil {
			return 0, false, fmt.Errorf("image billing field %s must be a number", field)
		}
		number = parsed
	case float64:
		number = typed
	case float32:
		number = float64(typed)
	case int:
		number = float64(typed)
	case int64:
		number = float64(typed)
	case uint:
		number = float64(typed)
	case uint64:
		number = float64(typed)
	default:
		return 0, false, fmt.Errorf("image billing field %s must be a number", field)
	}
	if math.IsNaN(number) || math.IsInf(number, 0) {
		return 0, false, fmt.Errorf("image billing field %s must be a finite number", field)
	}
	return number, true, nil
}

func cloneImageBillingRules(src map[string]ImageBillingRule) map[string]ImageBillingRule {
	if len(src) == 0 {
		return map[string]ImageBillingRule{}
	}
	dst := make(map[string]ImageBillingRule, len(src))
	for key, rule := range src {
		dst[key] = cloneImageBillingRule(rule)
	}
	return dst
}

func cloneImageBillingRule(rule ImageBillingRule) ImageBillingRule {
	rule.SizeRatios = cloneFloatMap(rule.SizeRatios)
	rule.QualityRatios = cloneFloatMap(rule.QualityRatios)
	if len(rule.ResolutionTiers) > 0 {
		rule.ResolutionTiers = append([]ImageBillingResolutionTier(nil), rule.ResolutionTiers...)
	}
	return rule
}

func cloneFloatMap(src map[string]float64) map[string]float64 {
	if len(src) == 0 {
		return nil
	}
	dst := make(map[string]float64, len(src))
	for key, value := range src {
		dst[key] = value
	}
	return dst
}
