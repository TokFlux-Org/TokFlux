package model

import (
	"time"

	"gorm.io/gorm"
)

const (
	GrowthRewardItemTypeAuto       = "auto"
	GrowthRewardItemTypeManual     = "manual"
	GrowthRewardItemTypeSemiAuto   = "semi_auto"
	GrowthRewardItemTypeInvitation = "invitation"
)

const (
	GrowthRewardItemDailyCheckin       = "daily_checkin"
	GrowthRewardItemCreateFirstAPIKey  = "create_first_api_key"
	GrowthRewardItemFirstAPIRequest    = "first_api_request"
	GrowthRewardItemFirstTopUp         = "first_topup"
	GrowthRewardItemThreeDayUsage      = "three_day_usage"
	GrowthRewardItemMonthlySpendTarget = "monthly_spend_target"
	GrowthRewardItemJoinCommunity      = "join_community"
	GrowthRewardItemContentPublish     = "content_publish"
	GrowthRewardItemBacklinkSubmission = "backlink_submission"
)

type GrowthRewardItem struct {
	Id          int    `json:"id" gorm:"primaryKey"`
	Code        string `json:"code" gorm:"type:varchar(64);uniqueIndex;not null"`
	Title       string `json:"title" gorm:"type:varchar(128);not null"`
	Description string `json:"description" gorm:"type:text"`
	RewardQuota int    `json:"reward_quota" gorm:"default:0"`
	ItemType    string `json:"item_type" gorm:"type:varchar(32);index;not null"`
	Enabled     bool   `json:"enabled" gorm:"default:true;index"`
	OncePerUser bool   `json:"once_per_user" gorm:"default:true"`
	DailyLimit  int    `json:"daily_limit" gorm:"default:0"`
	CreatedAt   int64  `json:"created_at" gorm:"bigint;index"`
	UpdatedAt   int64  `json:"updated_at" gorm:"bigint;index"`
}

func (GrowthRewardItem) TableName() string {
	return "growth_reward_items"
}

func (item *GrowthRewardItem) BeforeCreate(_ *gorm.DB) error {
	now := time.Now().Unix()
	if item.CreatedAt == 0 {
		item.CreatedAt = now
	}
	item.UpdatedAt = now
	return nil
}

func (item *GrowthRewardItem) BeforeUpdate(_ *gorm.DB) error {
	item.UpdatedAt = time.Now().Unix()
	return nil
}

func GetDefaultGrowthRewardItems() []*GrowthRewardItem {
	return []*GrowthRewardItem{
		{
			Code:        GrowthRewardItemDailyCheckin,
			Title:       "Daily check-in",
			Description: "Check in once per day to keep your account active.",
			ItemType:    GrowthRewardItemTypeAuto,
			Enabled:     true,
			OncePerUser: false,
			DailyLimit:  1,
		},
		{
			Code:        GrowthRewardItemCreateFirstAPIKey,
			Title:       "Create your first API key",
			Description: "Create an API key and prepare your first integration.",
			ItemType:    GrowthRewardItemTypeAuto,
			Enabled:     true,
			OncePerUser: true,
		},
		{
			Code:        GrowthRewardItemFirstAPIRequest,
			Title:       "Complete your first API request",
			Description: "Send one successful API request through the gateway.",
			ItemType:    GrowthRewardItemTypeAuto,
			Enabled:     true,
			OncePerUser: true,
		},
		{
			Code:        GrowthRewardItemFirstTopUp,
			Title:       "Complete your first top-up",
			Description: "Add funds for the first time.",
			ItemType:    GrowthRewardItemTypeAuto,
			Enabled:     true,
			OncePerUser: true,
		},
		{
			Code:        GrowthRewardItemThreeDayUsage,
			Title:       "Use the API for 3 consecutive days",
			Description: "Send requests on 3 consecutive days.",
			ItemType:    GrowthRewardItemTypeAuto,
			Enabled:     true,
			OncePerUser: true,
		},
		{
			Code:        GrowthRewardItemMonthlySpendTarget,
			Title:       "Reach this month's spend target",
			Description: "Reach the configured monthly consumption target.",
			ItemType:    GrowthRewardItemTypeAuto,
			Enabled:     true,
			OncePerUser: false,
			DailyLimit:  1,
		},
		{
			Code:        GrowthRewardItemJoinCommunity,
			Title:       "Join the community",
			Description: "Submit your community account or proof for review.",
			ItemType:    GrowthRewardItemTypeSemiAuto,
			Enabled:     true,
			OncePerUser: true,
		},
		{
			Code:        GrowthRewardItemContentPublish,
			Title:       "Publish an article, video, or tutorial",
			Description: "Share content that helps others use the API service.",
			ItemType:    GrowthRewardItemTypeManual,
			Enabled:     true,
			OncePerUser: false,
		},
		{
			Code:        GrowthRewardItemBacklinkSubmission,
			Title:       "Submit a website backlink or directory listing",
			Description: "Submit an approved backlink or directory listing.",
			ItemType:    GrowthRewardItemTypeManual,
			Enabled:     true,
			OncePerUser: false,
		},
	}
}

func migrateGrowthRewardTables() error {
	migrator := DB.Migrator()
	if migrator.HasTable("growth_tasks") && !migrator.HasTable(&GrowthRewardItem{}) {
		if err := migrator.RenameTable("growth_tasks", "growth_reward_items"); err != nil {
			return err
		}
	}
	if migrator.HasTable(&GrowthRewardItem{}) && migrator.HasColumn(&GrowthRewardItem{}, "task_type") && !migrator.HasColumn(&GrowthRewardItem{}, "item_type") {
		if err := migrator.RenameColumn(&GrowthRewardItem{}, "task_type", "item_type"); err != nil {
			return err
		}
	}
	if migrator.HasTable(&GrowthReward{}) && migrator.HasColumn(&GrowthReward{}, "task_code") && !migrator.HasColumn(&GrowthReward{}, "item_code") {
		if err := migrator.RenameColumn(&GrowthReward{}, "task_code", "item_code"); err != nil {
			return err
		}
	}
	if migrator.HasTable(&GrowthSubmission{}) && migrator.HasColumn(&GrowthSubmission{}, "task_code") && !migrator.HasColumn(&GrowthSubmission{}, "item_code") {
		if err := migrator.RenameColumn(&GrowthSubmission{}, "task_code", "item_code"); err != nil {
			return err
		}
	}
	return nil
}
