package service

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func seedPromotionCommissionLedger(t *testing.T, userID int, amountCents int64, quotaEquivalent int) *model.PromotionCommissionLedger {
	t.Helper()
	ledger := &model.PromotionCommissionLedger{
		UserId:           userID,
		SourceType:       model.PromotionCommissionSourceTopUpRebate,
		SourceId:         int(amountCents),
		SourceTradeNo:    "commission-test",
		Cashable:         true,
		Currency:         "CNY",
		GrossAmountCents: amountCents,
		NetAmountCents:   amountCents,
		QuotaEquivalent:  quotaEquivalent,
		Status:           model.PromotionCommissionStatusSettled,
	}
	require.NoError(t, model.DB.Create(ledger).Error)
	return ledger
}

func TestTransferAllSettledPromotionCommissionsToQuota(t *testing.T) {
	truncate(t)
	seedUser(t, 3001, 100)
	seedPromotionCommissionLedger(t, 3001, 1234, 5678)

	quota, err := TransferAllSettledPromotionCommissionsToQuota(3001)
	require.NoError(t, err)
	assert.Equal(t, 5678, quota)

	var user model.User
	require.NoError(t, model.DB.Where("id = ?", 3001).First(&user).Error)
	assert.Equal(t, 5778, user.Quota)

	var ledger model.PromotionCommissionLedger
	require.NoError(t, model.DB.Where("user_id = ?", 3001).First(&ledger).Error)
	assert.Equal(t, model.PromotionCommissionStatusTransferred, ledger.Status)
	assert.NotZero(t, ledger.TransferredAt)

	var event model.PromotionEvent
	require.NoError(t, model.DB.Where("user_id = ? AND event_type = ?", 3001, model.PromotionEventTypeCommissionTransferred).First(&event).Error)
	assert.Equal(t, 5678, event.QuotaDelta)
	assert.Equal(t, int64(1234), event.CashAmountCents)
}

func TestCreatePromotionWithdrawalLocksLedgersAndRejectReleases(t *testing.T) {
	truncate(t)
	seedUser(t, 3002, 0)
	seedPromotionCommissionLedger(t, 3002, 1000, 5000)

	withdrawal, err := CreatePromotionWithdrawal(3002, PromotionWithdrawalRequest{
		PayoutMethod:  "alipay",
		PayoutAccount: "user@example.com",
	})
	require.NoError(t, err)
	assert.Equal(t, int64(1000), withdrawal.NetAmountCents)
	assert.Equal(t, model.PromotionWithdrawalStatusPendingReview, withdrawal.Status)

	var ledger model.PromotionCommissionLedger
	require.NoError(t, model.DB.Where("user_id = ?", 3002).First(&ledger).Error)
	assert.Equal(t, model.PromotionCommissionStatusWithdrawing, ledger.Status)

	withdrawal, err = AdminRejectPromotionWithdrawal(withdrawal.Id, 1, PromotionWithdrawalReviewRequest{ReviewNote: "test"})
	require.NoError(t, err)
	assert.Equal(t, model.PromotionWithdrawalStatusRejected, withdrawal.Status)
	require.NoError(t, model.DB.Where("user_id = ?", 3002).First(&ledger).Error)
	assert.Equal(t, model.PromotionCommissionStatusSettled, ledger.Status)

	var events []model.PromotionEvent
	require.NoError(t, model.DB.Where("user_id = ?", 3002).Order("id ASC").Find(&events).Error)
	require.Len(t, events, 2)
	assert.Equal(t, model.PromotionEventTypeCommissionWithdrawSubmitted, events[0].EventType)
	assert.Equal(t, model.PromotionEventTypeCommissionWithdrawRejected, events[1].EventType)
}
