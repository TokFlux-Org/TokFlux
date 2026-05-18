package model

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
)

const (
	InvitationRewardTypeRegister     = "register"
	InvitationRewardTypeFirstRequest = "first_request"
	InvitationRewardTypeFirstTopUp   = "first_topup"
	InvitationRewardStatusSettled    = "settled"
)

type InvitationReward struct {
	Id             int    `json:"id"`
	InviterId      int    `json:"inviter_id" gorm:"index"`
	InviteeId      int    `json:"invitee_id" gorm:"index:idx_invitation_reward_invitee_type,unique"`
	RewardType     string `json:"reward_type" gorm:"type:varchar(32);index:idx_invitation_reward_invitee_type,unique"`
	RewardQuota    int    `json:"reward_quota"`
	TriggerAt      int64  `json:"trigger_at" gorm:"index"`
	TriggerTopUpId int    `json:"trigger_top_up_id" gorm:"index"`
	TriggerTradeNo string `json:"trigger_trade_no" gorm:"type:varchar(255);index"`
	RuleSnapshot   string `json:"rule_snapshot" gorm:"type:text"`
	Remark         string `json:"remark" gorm:"type:text"`
	Status         string `json:"status" gorm:"type:varchar(32);index"`
	CreatedAt      int64  `json:"created_at" gorm:"index"`
	SettledAt      int64  `json:"settled_at" gorm:"index"`
}

type UserInvitationRewardRecord struct {
	Id             int    `json:"id"`
	InviteeId      int    `json:"invitee_id"`
	InviteeName    string `json:"invitee_name"`
	RewardType     string `json:"reward_type"`
	RewardQuota    int    `json:"reward_quota"`
	TriggerAt      int64  `json:"trigger_at"`
	TriggerTopUpId int    `json:"trigger_top_up_id"`
	TriggerTradeNo string `json:"trigger_trade_no"`
	Remark         string `json:"remark"`
	Status         string `json:"status"`
	CreatedAt      int64  `json:"created_at"`
	SettledAt      int64  `json:"settled_at"`
}

func SettleInvitationMilestoneRewardTx(tx *gorm.DB, inviteeId int, rewardType string) (*InvitationReward, error) {
	if tx == nil {
		return nil, errors.New("transaction is required")
	}
	if inviteeId <= 0 || rewardType == "" {
		return nil, nil
	}
	if !operation_setting.IsPaymentComplianceConfirmed() {
		return nil, nil
	}

	rewardQuota := resolveInvitationMilestoneRewardQuota(rewardType)
	if rewardQuota <= 0 {
		return nil, nil
	}

	var invitee User
	if err := tx.Select("id", "inviter_id").Where("id = ?", inviteeId).First(&invitee).Error; err != nil {
		return nil, err
	}
	if invitee.InviterId == 0 {
		return nil, nil
	}

	var existing InvitationReward
	err := tx.Where("invitee_id = ? AND reward_type = ?", inviteeId, rewardType).First(&existing).Error
	if err == nil {
		return nil, nil
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	triggerAt := common.GetTimestamp()
	triggerTopUpId := 0
	triggerTradeNo := ""
	if rewardType == InvitationRewardTypeFirstTopUp {
		var successTopUpCount int64
		if err := tx.Model(&TopUp{}).
			Where("user_id = ? AND status = ?", inviteeId, common.TopUpStatusSuccess).
			Count(&successTopUpCount).Error; err != nil {
			return nil, err
		}
		if successTopUpCount != 1 {
			return nil, nil
		}
		var topUp TopUp
		if err := tx.Select("id", "trade_no", "complete_time", "create_time").
			Where("user_id = ? AND status = ?", inviteeId, common.TopUpStatusSuccess).
			Order("id ASC").
			First(&topUp).Error; err != nil {
			return nil, err
		}
		triggerTopUpId = topUp.Id
		triggerTradeNo = topUp.TradeNo
		if topUp.CompleteTime > 0 {
			triggerAt = topUp.CompleteTime
		} else if topUp.CreateTime > 0 {
			triggerAt = topUp.CreateTime
		}
	}

	now := common.GetTimestamp()
	reward := &InvitationReward{
		InviterId:      invitee.InviterId,
		InviteeId:      invitee.Id,
		RewardType:     rewardType,
		RewardQuota:    rewardQuota,
		TriggerAt:      triggerAt,
		TriggerTopUpId: triggerTopUpId,
		TriggerTradeNo: triggerTradeNo,
		RuleSnapshot:   buildInvitationRewardRuleSnapshot(rewardType, rewardQuota),
		Status:         InvitationRewardStatusSettled,
		CreatedAt:      now,
		SettledAt:      now,
	}
	if err = tx.Create(reward).Error; err != nil {
		return nil, err
	}
	if err = tx.Model(&User{}).
		Where("id = ?", reward.InviterId).
		Updates(map[string]interface{}{
			"aff_quota":   gorm.Expr("aff_quota + ?", rewardQuota),
			"aff_history": gorm.Expr("aff_history + ?", rewardQuota),
		}).Error; err != nil {
		return nil, err
	}
	if err = CreateInvitationRewardEventTx(tx, reward); err != nil {
		return nil, err
	}

	return reward, nil
}

func CreateInvitationRegisterRewardTx(tx *gorm.DB, inviterId int, inviteeId int) (*InvitationReward, error) {
	if tx == nil {
		return nil, errors.New("transaction is required")
	}
	if inviterId <= 0 || inviteeId <= 0 || common.QuotaForInviter <= 0 {
		return nil, nil
	}

	var existing InvitationReward
	err := tx.Where("invitee_id = ? AND reward_type = ?", inviteeId, InvitationRewardTypeRegister).First(&existing).Error
	if err == nil {
		return nil, nil
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	now := common.GetTimestamp()
	reward := &InvitationReward{
		InviterId:    inviterId,
		InviteeId:    inviteeId,
		RewardType:   InvitationRewardTypeRegister,
		RewardQuota:  common.QuotaForInviter,
		TriggerAt:    now,
		RuleSnapshot: buildInvitationRewardRuleSnapshot(InvitationRewardTypeRegister, common.QuotaForInviter),
		Status:       InvitationRewardStatusSettled,
		CreatedAt:    now,
		SettledAt:    now,
	}
	if err = tx.Create(reward).Error; err != nil {
		return nil, err
	}
	if err = CreateInvitationRewardEventTx(tx, reward); err != nil {
		return nil, err
	}
	return reward, nil
}

func buildInvitationRewardRuleSnapshot(rewardType string, rewardQuota int) string {
	snapshot := map[string]interface{}{
		"reward_type":  rewardType,
		"reward_quota": rewardQuota,
	}
	data, err := common.Marshal(snapshot)
	if err != nil {
		return ""
	}
	return string(data)
}

func SettleInvitationMilestoneReward(inviteeId int, rewardType string) (*InvitationReward, error) {
	var reward *InvitationReward
	err := DB.Transaction(func(tx *gorm.DB) error {
		settledReward, err := SettleInvitationMilestoneRewardTx(tx, inviteeId, rewardType)
		if err != nil {
			return err
		}
		reward = settledReward
		return nil
	})
	return reward, err
}

func RecordInvitationMilestoneRewardLog(reward *InvitationReward) {
	if reward == nil {
		return
	}
	content := fmt.Sprintf(
		"Invitation milestone reward settled: %s for %s from user #%d",
		logger.LogQuota(reward.RewardQuota),
		reward.RewardType,
		reward.InviteeId,
	)
	RecordLog(reward.InviterId, LogTypeSystem, content)
}

func SettleInvitationFirstRequestReward(inviteeId int) {
	reward, err := SettleInvitationMilestoneReward(inviteeId, InvitationRewardTypeFirstRequest)
	if err != nil {
		common.SysLog(fmt.Sprintf("failed to settle invitation first request reward for user %d: %v", inviteeId, err))
		return
	}
	RecordInvitationMilestoneRewardLog(reward)
}

func resolveInvitationMilestoneRewardQuota(rewardType string) int {
	setting := operation_setting.GetGrowthSetting()
	switch rewardType {
	case InvitationRewardTypeRegister:
		return common.QuotaForInviter
	case InvitationRewardTypeFirstRequest:
		return setting.InviteFirstRequestRewardQuota
	case InvitationRewardTypeFirstTopUp:
		return setting.InviteFirstTopUpRewardQuota
	default:
		return 0
	}
}

func GetUserInvitationRewardRecords(inviterId int, pageInfo *common.PageInfo) (
	records []*UserInvitationRewardRecord,
	total int64,
	err error,
) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	err = tx.Model(&InvitationReward{}).Where("inviter_id = ?", inviterId).Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	err = tx.Table("invitation_rewards").
		Select("invitation_rewards.id, invitation_rewards.invitee_id, COALESCE(NULLIF(users.display_name, ''), users.username) AS invitee_name, invitation_rewards.reward_type, invitation_rewards.reward_quota, invitation_rewards.trigger_at, invitation_rewards.trigger_top_up_id, invitation_rewards.trigger_trade_no, invitation_rewards.remark, invitation_rewards.status, invitation_rewards.created_at, invitation_rewards.settled_at").
		Joins("LEFT JOIN users ON users.id = invitation_rewards.invitee_id").
		Where("invitation_rewards.inviter_id = ?", inviterId).
		Order("invitation_rewards.id DESC").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Scan(&records).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return records, total, nil
}
