package model

import (
	"errors"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	GrowthRewardStatusPending     = "pending"
	GrowthRewardStatusSettled     = "settled"
	GrowthRewardStatusTransferred = "transferred"
	GrowthRewardStatusFrozen      = "frozen"
	GrowthRewardStatusRejected    = "rejected"
)

type GrowthReward struct {
	Id          int    `json:"id" gorm:"primaryKey"`
	UserId      int    `json:"user_id" gorm:"index;not null"`
	ItemCode    string `json:"item_code" gorm:"type:varchar(64);index;not null"`
	RewardQuota int    `json:"reward_quota" gorm:"not null;default:0"`
	Status      string `json:"status" gorm:"type:varchar(32);index;not null"`
	SourceId    int    `json:"source_id" gorm:"index;default:0"`
	AvailableAt int64  `json:"available_at" gorm:"bigint;index"`
	CreatedAt   int64  `json:"created_at" gorm:"bigint;index"`
	SettledAt   int64  `json:"settled_at" gorm:"bigint;index"`
	Remark      string `json:"remark" gorm:"type:text"`
}

type GrowthRewardSummary struct {
	AvailableRewardQuota int64 `json:"available_reward_quota"`
	PendingRewardQuota   int64 `json:"pending_reward_quota"`
	TotalRewardQuota     int64 `json:"total_reward_quota"`
}

func (GrowthReward) TableName() string {
	return "growth_rewards"
}

func (reward *GrowthReward) BeforeCreate(_ *gorm.DB) error {
	if reward.CreatedAt == 0 {
		reward.CreatedAt = time.Now().Unix()
	}
	return nil
}

func HasGrowthReward(userId int, itemCode string) (bool, error) {
	var count int64
	err := DB.Model(&GrowthReward{}).
		Where("user_id = ? AND item_code = ? AND status <> ?", userId, itemCode, GrowthRewardStatusRejected).
		Count(&count).Error
	return count > 0, err
}

func CountGrowthRewardsSince(userId int, itemCode string, since int64) (int64, error) {
	tx := DB.Model(&GrowthReward{}).
		Where("user_id = ? AND item_code = ? AND status <> ?", userId, itemCode, GrowthRewardStatusRejected)
	if since > 0 {
		tx = tx.Where("created_at >= ?", since)
	}
	var count int64
	err := tx.Count(&count).Error
	return count, err
}

func CreateSettledGrowthReward(userId int, itemCode string, rewardQuota int, sourceId int, remark string) (*GrowthReward, error) {
	reward := NewSettledGrowthReward(userId, itemCode, rewardQuota, sourceId, remark)
	err := DB.Transaction(func(tx *gorm.DB) error {
		return CreateSettledGrowthRewardTx(tx, reward)
	})
	if err != nil {
		return nil, err
	}
	if rewardQuota > 0 {
		go func() {
			_ = cacheIncrUserQuota(userId, int64(rewardQuota))
		}()
	}
	return reward, nil
}

func NewSettledGrowthReward(userId int, itemCode string, rewardQuota int, sourceId int, remark string) *GrowthReward {
	now := time.Now().Unix()
	return &GrowthReward{
		UserId:      userId,
		ItemCode:    itemCode,
		RewardQuota: rewardQuota,
		Status:      GrowthRewardStatusSettled,
		SourceId:    sourceId,
		AvailableAt: now,
		CreatedAt:   now,
		SettledAt:   now,
		Remark:      remark,
	}
}

func CreateSettledGrowthRewardTx(tx *gorm.DB, reward *GrowthReward) error {
	if tx == nil {
		return errors.New("transaction is required")
	}
	if reward == nil {
		return errors.New("reward is required")
	}
	if err := tx.Create(reward).Error; err != nil {
		return err
	}
	if err := CreateGrowthRewardEventTx(tx, reward); err != nil {
		return err
	}
	if reward.RewardQuota <= 0 {
		return nil
	}
	return tx.Model(&User{}).
		Where("id = ?", reward.UserId).
		Update("quota", gorm.Expr("quota + ?", reward.RewardQuota)).Error
}

func GetGrowthRewardSummary(userId int) (*GrowthRewardSummary, error) {
	summary := &GrowthRewardSummary{}
	if err := DB.Model(&User{}).Where("id = ?", userId).Select("aff_quota").Scan(&summary.AvailableRewardQuota).Error; err != nil {
		return nil, err
	}
	if err := DB.Model(&GrowthReward{}).
		Where("user_id = ? AND status = ?", userId, GrowthRewardStatusPending).
		Select("COALESCE(SUM(reward_quota), 0)").
		Scan(&summary.PendingRewardQuota).Error; err != nil {
		return nil, err
	}
	var growthTotal int64
	if err := DB.Model(&GrowthReward{}).
		Where("user_id = ? AND status IN ?", userId, []string{GrowthRewardStatusSettled, GrowthRewardStatusTransferred}).
		Select("COALESCE(SUM(reward_quota), 0)").
		Scan(&growthTotal).Error; err != nil {
		return nil, err
	}
	var affTotal int64
	if err := DB.Model(&User{}).Where("id = ?", userId).Select("aff_history").Scan(&affTotal).Error; err != nil {
		return nil, err
	}
	summary.TotalRewardQuota = growthTotal + affTotal
	return summary, nil
}

func ListGrowthRewards(userId int, pageInfo *common.PageInfo) ([]*GrowthReward, int64, error) {
	if pageInfo == nil {
		return nil, 0, errors.New("page info is required")
	}
	var total int64
	if err := DB.Model(&GrowthReward{}).Where("user_id = ?", userId).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rewards []*GrowthReward
	err := DB.Where("user_id = ?", userId).
		Order("id DESC").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&rewards).Error
	return rewards, total, err
}
