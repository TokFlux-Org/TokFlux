package model

import (
	"strconv"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func insertInviterAndInviteeForRebateTest(t *testing.T, inviterID int, inviteeID int) {
	t.Helper()

	inviter := &User{
		Id:       inviterID,
		Username: "rebate_inviter",
		AffCode:  "rebate_inviter_" + strconv.Itoa(inviterID),
		Status:   common.UserStatusEnabled,
	}
	invitee := &User{
		Id:        inviteeID,
		Username:  "rebate_invitee",
		AffCode:   "rebate_invitee_" + strconv.Itoa(inviteeID),
		Status:    common.UserStatusEnabled,
		InviterId: inviterID,
	}

	require.NoError(t, DB.Create(inviter).Error)
	require.NoError(t, DB.Create(invitee).Error)
}

func getInvitationRebateCountForTest(t *testing.T, inviterID int) int64 {
	t.Helper()

	var count int64
	require.NoError(t, DB.Model(&InvitationRebate{}).Where("inviter_id = ?", inviterID).Count(&count).Error)
	return count
}

func getInvitationRewardCountForTest(t *testing.T, inviterID int, rewardType string) int64 {
	t.Helper()

	var count int64
	require.NoError(t, DB.Model(&InvitationReward{}).Where("inviter_id = ? AND reward_type = ?", inviterID, rewardType).Count(&count).Error)
	return count
}

func getInvitationQuotaForTest(t *testing.T, userID int) (int, int) {
	t.Helper()

	var user User
	require.NoError(t, DB.Select("aff_quota", "aff_history").Where("id = ?", userID).First(&user).Error)
	return user.AffQuota, user.AffHistoryQuota
}

func getPromotionCommissionLedgerForTest(t *testing.T, userID int) PromotionCommissionLedger {
	t.Helper()

	var ledger PromotionCommissionLedger
	require.NoError(t, DB.Where("user_id = ?", userID).First(&ledger).Error)
	return ledger
}

func setInvitationRebateFreezeDaysForTest(t *testing.T, days int) {
	t.Helper()

	growthSetting := operation_setting.GetGrowthSetting()
	oldDays := growthSetting.RebateFreezeDays
	t.Cleanup(func() {
		growthSetting.RebateFreezeDays = oldDays
	})
	growthSetting.RebateFreezeDays = days
}

func getInvitationRebateForTest(t *testing.T, inviterID int) InvitationRebate {
	t.Helper()

	var rebate InvitationRebate
	require.NoError(t, DB.Where("inviter_id = ?", inviterID).First(&rebate).Error)
	return rebate
}

func TestRechargeWaffo_SettlesInvitationRebate(t *testing.T) {
	truncateTables(t)
	setInvitationRebateFreezeDaysForTest(t, 0)

	insertInviterAndInviteeForRebateTest(t, 501, 502)
	insertTopUpForPaymentGuardTest(t, "rebate-waffo-order", 502, PaymentProviderWaffo)

	topUp := GetTopUpByTradeNo("rebate-waffo-order")
	require.NotNil(t, topUp)
	topUp.Amount = 10
	topUp.Money = 20
	require.NoError(t, topUp.Update())

	require.NoError(t, RechargeWaffo("rebate-waffo-order", "127.0.0.1"))

	affQuota, affHistoryQuota := getInvitationQuotaForTest(t, 501)
	expectedQuota := CalculateInvitationRebateQuota(20)
	assert.Zero(t, affQuota)
	assert.Zero(t, affHistoryQuota)
	assert.Equal(t, int64(1), getInvitationRebateCountForTest(t, 501))
	ledger := getPromotionCommissionLedgerForTest(t, 501)
	assert.Equal(t, PromotionCommissionStatusSettled, ledger.Status)
	assert.Equal(t, int64(200), ledger.GrossAmountCents)
	assert.Equal(t, expectedQuota, ledger.QuotaEquivalent)
}

func TestRechargeWaffo_CreatesPendingInvitationRebateDuringFreeze(t *testing.T) {
	truncateTables(t)
	setInvitationRebateFreezeDaysForTest(t, 7)

	insertInviterAndInviteeForRebateTest(t, 551, 552)
	insertTopUpForPaymentGuardTest(t, "rebate-waffo-freeze-order", 552, PaymentProviderWaffo)

	topUp := GetTopUpByTradeNo("rebate-waffo-freeze-order")
	require.NotNil(t, topUp)
	topUp.Amount = 10
	topUp.Money = 20
	require.NoError(t, topUp.Update())

	require.NoError(t, RechargeWaffo("rebate-waffo-freeze-order", "127.0.0.1"))

	affQuota, affHistoryQuota := getInvitationQuotaForTest(t, 551)
	assert.Zero(t, affQuota)
	assert.Zero(t, affHistoryQuota)

	rebate := getInvitationRebateForTest(t, 551)
	assert.Equal(t, InvitationRebateStatusPending, rebate.Status)
	assert.Equal(t, 7, rebate.FreezeDays)
	assert.Greater(t, rebate.SettleAfter, rebate.CreatedAt)
	assert.Equal(t, PaymentProviderWaffo, rebate.PaymentProvider)

	require.NoError(t, DB.Model(&InvitationRebate{}).
		Where("id = ?", rebate.Id).
		Update("settle_after", common.GetTimestamp()-1).Error)
	require.NoError(t, SyncInvitationRebatesForInviter(551))

	affQuota, affHistoryQuota = getInvitationQuotaForTest(t, 551)
	expectedQuota := CalculateInvitationRebateQuota(20)
	assert.Zero(t, affQuota)
	assert.Zero(t, affHistoryQuota)

	rebate = getInvitationRebateForTest(t, 551)
	assert.Equal(t, InvitationRebateStatusSettled, rebate.Status)
	assert.NotZero(t, rebate.SettledAt)
	ledger := getPromotionCommissionLedgerForTest(t, 551)
	assert.Equal(t, PromotionCommissionStatusSettled, ledger.Status)
	assert.Equal(t, expectedQuota, ledger.QuotaEquivalent)
}

func TestSyncInvitationRebatesForInviter_BackfillsOnlyOnce(t *testing.T) {
	truncateTables(t)
	setInvitationRebateFreezeDaysForTest(t, 0)

	insertInviterAndInviteeForRebateTest(t, 601, 602)

	topUp := &TopUp{
		UserId:          602,
		Amount:          10,
		Money:           12.5,
		TradeNo:         "rebate-epay-backfill",
		PaymentMethod:   "alipay",
		PaymentProvider: PaymentProviderEpay,
		CreateTime:      time.Now().Unix(),
		CompleteTime:    time.Now().Unix(),
		Status:          common.TopUpStatusSuccess,
	}
	require.NoError(t, topUp.Insert())

	require.NoError(t, SyncInvitationRebatesForInviter(601))
	require.NoError(t, SyncInvitationRebatesForInviter(601))

	affQuota, affHistoryQuota := getInvitationQuotaForTest(t, 601)
	expectedQuota := CalculateInvitationRebateQuota(12.5)
	assert.Zero(t, affQuota)
	assert.Zero(t, affHistoryQuota)
	assert.Equal(t, int64(1), getInvitationRebateCountForTest(t, 601))
	ledger := getPromotionCommissionLedgerForTest(t, 601)
	assert.Equal(t, PromotionCommissionStatusSettled, ledger.Status)
	assert.Equal(t, expectedQuota, ledger.QuotaEquivalent)
}

func TestReverseInvitationRebate_TransferredCashCommissionDeductsQuota(t *testing.T) {
	truncateTables(t)
	setInvitationRebateFreezeDaysForTest(t, 0)

	insertInviterAndInviteeForRebateTest(t, 651, 652)
	topUp := &TopUp{
		UserId:          652,
		Amount:          10,
		Money:           20,
		TradeNo:         "rebate-transfer-reversal",
		PaymentMethod:   "alipay",
		PaymentProvider: PaymentProviderEpay,
		CreateTime:      time.Now().Unix(),
		CompleteTime:    time.Now().Unix(),
		Status:          common.TopUpStatusSuccess,
	}
	require.NoError(t, topUp.Insert())
	rebate, err := SettleInvitationRebateTx(DB, topUp)
	require.NoError(t, err)
	require.NotNil(t, rebate)

	ledger := getPromotionCommissionLedgerForTest(t, 651)
	require.NoError(t, DB.Model(&User{}).
		Where("id = ?", 651).
		Update("quota", gorm.Expr("quota + ?", ledger.QuotaEquivalent)).Error)
	require.NoError(t, DB.Model(&PromotionCommissionLedger{}).
		Where("id = ?", ledger.Id).
		Updates(map[string]interface{}{
			"status":         PromotionCommissionStatusTransferred,
			"transferred_at": common.GetTimestamp(),
		}).Error)

	_, err = ReverseInvitationRebateByTopUp(topUp.Id, "refund-transfer-reversal", "refund")
	require.NoError(t, err)

	var user User
	require.NoError(t, DB.Where("id = ?", 651).First(&user).Error)
	assert.Zero(t, user.Quota)

	ledger = getPromotionCommissionLedgerForTest(t, 651)
	assert.Equal(t, PromotionCommissionStatusReversed, ledger.Status)
	assert.Equal(t, "refund-transfer-reversal", ledger.RefundTradeNo)
	assert.Equal(t, ledger.NetAmountCents, ledger.ReversalAmountCents)
	assert.Equal(t, ledger.QuotaEquivalent, ledger.ReversalQuota)
	assert.NotZero(t, ledger.ReversedAt)
}

func TestReverseInvitationRebateByTradeNo_ReversesRebateAndLedger(t *testing.T) {
	truncateTables(t)
	setInvitationRebateFreezeDaysForTest(t, 0)

	insertInviterAndInviteeForRebateTest(t, 661, 662)
	topUp := &TopUp{
		UserId:          662,
		Amount:          10,
		Money:           20,
		TradeNo:         "rebate-tradeno-reversal",
		PaymentMethod:   "alipay",
		PaymentProvider: PaymentProviderEpay,
		CreateTime:      time.Now().Unix(),
		CompleteTime:    time.Now().Unix(),
		Status:          common.TopUpStatusSuccess,
	}
	require.NoError(t, topUp.Insert())
	rebate, err := SettleInvitationRebateTx(DB, topUp)
	require.NoError(t, err)
	require.NotNil(t, rebate)

	reversed, err := ReverseInvitationRebateByTradeNo("rebate-tradeno-reversal", "refund-tradeno-reversal", "refund")
	require.NoError(t, err)
	require.NotNil(t, reversed)
	assert.Equal(t, InvitationRebateStatusReversed, reversed.Status)
	assert.Equal(t, "refund-tradeno-reversal", reversed.RefundTradeNo)
	assert.Equal(t, reversed.RebateQuota, reversed.ReversalQuota)
	assert.NotZero(t, reversed.ReversedAt)

	ledger := getPromotionCommissionLedgerForTest(t, 661)
	assert.Equal(t, PromotionCommissionStatusReversed, ledger.Status)
	assert.Equal(t, "refund-tradeno-reversal", ledger.RefundTradeNo)
	assert.Equal(t, ledger.NetAmountCents, ledger.ReversalAmountCents)
	assert.Equal(t, ledger.QuotaEquivalent, ledger.ReversalQuota)
}

func TestReverseInvitationRebateByTradeNo_IsIdempotent(t *testing.T) {
	truncateTables(t)
	setInvitationRebateFreezeDaysForTest(t, 0)

	insertInviterAndInviteeForRebateTest(t, 671, 672)
	topUp := &TopUp{
		UserId:          672,
		Amount:          10,
		Money:           20,
		TradeNo:         "rebate-idempotent-reversal",
		PaymentMethod:   "alipay",
		PaymentProvider: PaymentProviderEpay,
		CreateTime:      time.Now().Unix(),
		CompleteTime:    time.Now().Unix(),
		Status:          common.TopUpStatusSuccess,
	}
	require.NoError(t, topUp.Insert())
	_, err := SettleInvitationRebateTx(DB, topUp)
	require.NoError(t, err)

	first, err := ReverseInvitationRebateByTradeNo("rebate-idempotent-reversal", "refund-idempotent-first", "refund")
	require.NoError(t, err)
	require.NotNil(t, first)
	second, err := ReverseInvitationRebateByTradeNo("rebate-idempotent-reversal", "refund-idempotent-second", "refund")
	require.NoError(t, err)
	require.NotNil(t, second)

	assert.Equal(t, InvitationRebateStatusReversed, second.Status)
	assert.Equal(t, "refund-idempotent-first", second.RefundTradeNo)

	var count int64
	require.NoError(t, DB.Model(&PromotionEvent{}).
		Where("source_table = ? AND source_id = ? AND event_type = ?", PromotionEventSourceCommissionLedger, getPromotionCommissionLedgerForTest(t, 671).Id, PromotionEventTypeCommissionReversed).
		Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

func TestSyncInvitationRebatesForInviter_ExcludesSubscriptionTopUps(t *testing.T) {
	truncateTables(t)
	setInvitationRebateFreezeDaysForTest(t, 0)

	insertInviterAndInviteeForRebateTest(t, 701, 702)
	plan := insertSubscriptionPlanForPaymentGuardTest(t, 801)
	insertSubscriptionOrderForPaymentGuardTest(t, "rebate-subscription-order", 702, plan.Id, PaymentProviderStripe)
	topUp := &TopUp{
		UserId:          702,
		Amount:          0,
		Money:           9.99,
		TradeNo:         "rebate-subscription-order",
		PaymentMethod:   PaymentMethodStripe,
		PaymentProvider: PaymentProviderStripe,
		CreateTime:      time.Now().Unix(),
		CompleteTime:    time.Now().Unix(),
		Status:          common.TopUpStatusSuccess,
	}
	require.NoError(t, topUp.Insert())

	require.NoError(t, SyncInvitationRebatesForInviter(701))

	affQuota, affHistoryQuota := getInvitationQuotaForTest(t, 701)
	assert.Zero(t, affQuota)
	assert.Zero(t, affHistoryQuota)
	assert.Equal(t, int64(0), getInvitationRebateCountForTest(t, 701))
}

func TestInvitationFirstTopUpReward_SettlesOnlyOnce(t *testing.T) {
	truncateTables(t)
	growthSetting := operation_setting.GetGrowthSetting()
	oldQuota := growthSetting.InviteFirstTopUpRewardQuota
	oldCompliance := operation_setting.GetPaymentSetting().ComplianceConfirmed
	oldComplianceVersion := operation_setting.GetPaymentSetting().ComplianceTermsVersion
	t.Cleanup(func() {
		growthSetting.InviteFirstTopUpRewardQuota = oldQuota
		operation_setting.GetPaymentSetting().ComplianceConfirmed = oldCompliance
		operation_setting.GetPaymentSetting().ComplianceTermsVersion = oldComplianceVersion
	})
	growthSetting.InviteFirstTopUpRewardQuota = 1234
	operation_setting.GetPaymentSetting().ComplianceConfirmed = true
	operation_setting.GetPaymentSetting().ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion

	insertInviterAndInviteeForRebateTest(t, 801, 802)

	topUp := &TopUp{
		UserId:          802,
		Amount:          10,
		Money:           10,
		TradeNo:         "reward-first-topup-1",
		PaymentMethod:   "alipay",
		PaymentProvider: PaymentProviderEpay,
		CreateTime:      time.Now().Unix(),
		CompleteTime:    time.Now().Unix(),
		Status:          common.TopUpStatusSuccess,
	}
	require.NoError(t, topUp.Insert())

	var reward *InvitationReward
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		var err error
		reward, err = SettleInvitationMilestoneRewardTx(tx, 802, InvitationRewardTypeFirstTopUp)
		return err
	}))
	require.NotNil(t, reward)

	secondTopUp := &TopUp{
		UserId:          802,
		Amount:          10,
		Money:           10,
		TradeNo:         "reward-first-topup-2",
		PaymentMethod:   "alipay",
		PaymentProvider: PaymentProviderEpay,
		CreateTime:      time.Now().Unix(),
		CompleteTime:    time.Now().Unix(),
		Status:          common.TopUpStatusSuccess,
	}
	require.NoError(t, secondTopUp.Insert())
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		reward, err := SettleInvitationMilestoneRewardTx(tx, 802, InvitationRewardTypeFirstTopUp)
		require.NoError(t, err)
		assert.Nil(t, reward)
		return nil
	}))

	affQuota, affHistoryQuota := getInvitationQuotaForTest(t, 801)
	assert.Equal(t, 1234, affQuota)
	assert.Equal(t, 1234, affHistoryQuota)
	assert.Equal(t, int64(1), getInvitationRewardCountForTest(t, 801, InvitationRewardTypeFirstTopUp))
}

func TestInvitationFirstRequestReward_SettlesOnlyOnce(t *testing.T) {
	truncateTables(t)
	growthSetting := operation_setting.GetGrowthSetting()
	oldQuota := growthSetting.InviteFirstRequestRewardQuota
	oldCompliance := operation_setting.GetPaymentSetting().ComplianceConfirmed
	oldComplianceVersion := operation_setting.GetPaymentSetting().ComplianceTermsVersion
	t.Cleanup(func() {
		growthSetting.InviteFirstRequestRewardQuota = oldQuota
		operation_setting.GetPaymentSetting().ComplianceConfirmed = oldCompliance
		operation_setting.GetPaymentSetting().ComplianceTermsVersion = oldComplianceVersion
	})
	growthSetting.InviteFirstRequestRewardQuota = 4321
	operation_setting.GetPaymentSetting().ComplianceConfirmed = true
	operation_setting.GetPaymentSetting().ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion

	insertInviterAndInviteeForRebateTest(t, 901, 902)

	reward, err := SettleInvitationMilestoneReward(902, InvitationRewardTypeFirstRequest)
	require.NoError(t, err)
	require.NotNil(t, reward)
	reward, err = SettleInvitationMilestoneReward(902, InvitationRewardTypeFirstRequest)
	require.NoError(t, err)
	assert.Nil(t, reward)

	affQuota, affHistoryQuota := getInvitationQuotaForTest(t, 901)
	assert.Equal(t, 4321, affQuota)
	assert.Equal(t, 4321, affHistoryQuota)
	assert.Equal(t, int64(1), getInvitationRewardCountForTest(t, 901, InvitationRewardTypeFirstRequest))
}

func TestInvitationRegisterReward_IsRecorded(t *testing.T) {
	truncateTables(t)
	oldQuotaForInviter := common.QuotaForInviter
	oldCompliance := operation_setting.GetPaymentSetting().ComplianceConfirmed
	oldComplianceVersion := operation_setting.GetPaymentSetting().ComplianceTermsVersion
	t.Cleanup(func() {
		common.QuotaForInviter = oldQuotaForInviter
		operation_setting.GetPaymentSetting().ComplianceConfirmed = oldCompliance
		operation_setting.GetPaymentSetting().ComplianceTermsVersion = oldComplianceVersion
	})
	common.QuotaForInviter = 2468
	operation_setting.GetPaymentSetting().ComplianceConfirmed = true
	operation_setting.GetPaymentSetting().ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion

	inviter := &User{
		Id:       1001,
		Username: "register_reward_inviter",
		AffCode:  "register_reward_inviter",
		Status:   common.UserStatusEnabled,
	}
	require.NoError(t, DB.Create(inviter).Error)

	invitee := &User{
		Username:  "register_reward_invitee",
		Password:  "password123",
		InviterId: 1001,
		Status:    common.UserStatusEnabled,
	}
	require.NoError(t, invitee.Insert(1001))

	affQuota, affHistoryQuota := getInvitationQuotaForTest(t, 1001)
	assert.Equal(t, 2468, affQuota)
	assert.Equal(t, 2468, affHistoryQuota)
	assert.Equal(t, int64(1), getInvitationRewardCountForTest(t, 1001, InvitationRewardTypeRegister))

	var reward InvitationReward
	require.NoError(t, DB.Where("inviter_id = ? AND reward_type = ?", 1001, InvitationRewardTypeRegister).First(&reward).Error)
	assert.Equal(t, invitee.Id, reward.InviteeId)
	assert.Equal(t, 2468, reward.RewardQuota)
	assert.Equal(t, InvitationRewardStatusSettled, reward.Status)
}
