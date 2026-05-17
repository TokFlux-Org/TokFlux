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
	InvitationRebateStatusPending  = "pending"
	InvitationRebateStatusSettled  = "settled"
	InvitationRebateStatusFrozen   = "frozen"
	InvitationRebateStatusReversed = "reversed"
)

type InvitationRebate struct {
	Id                   int     `json:"id"`
	InviterId            int     `json:"inviter_id" gorm:"index"`
	InviteeId            int     `json:"invitee_id" gorm:"index"`
	TopUpId              int     `json:"top_up_id" gorm:"uniqueIndex"`
	TradeNo              string  `json:"trade_no" gorm:"type:varchar(255);index"`
	TopUpMoney           float64 `json:"top_up_money"`
	PaymentMethod        string  `json:"payment_method" gorm:"type:varchar(50);index"`
	PaymentProvider      string  `json:"payment_provider" gorm:"type:varchar(50);index"`
	RebatePercentage     float64 `json:"rebate_percentage"`
	QuotaPerUnitSnapshot float64 `json:"quota_per_unit_snapshot"`
	RebateAmount         float64 `json:"rebate_amount"`
	RebateQuota          int     `json:"rebate_quota"`
	FreezeDays           int     `json:"freeze_days"`
	SettleAfter          int64   `json:"settle_after" gorm:"index"`
	RuleSnapshot         string  `json:"rule_snapshot" gorm:"type:text"`
	RiskStatus           string  `json:"risk_status" gorm:"type:varchar(32);index"`
	RefundTradeNo        string  `json:"refund_trade_no" gorm:"type:varchar(255);index"`
	ReversalQuota        int     `json:"reversal_quota"`
	ReversedAt           int64   `json:"reversed_at" gorm:"index"`
	Remark               string  `json:"remark" gorm:"type:text"`
	ReviewBy             int     `json:"review_by" gorm:"index"`
	Status               string  `json:"status" gorm:"type:varchar(32);index"`
	CreatedAt            int64   `json:"created_at" gorm:"index"`
	SettledAt            int64   `json:"settled_at" gorm:"index"`
}

type UserInvitationRebateRecord struct {
	Id                   int     `json:"id"`
	InviteeId            int     `json:"invitee_id"`
	InviteeName          string  `json:"invitee_name"`
	TradeNo              string  `json:"trade_no"`
	TopUpMoney           float64 `json:"top_up_money"`
	PaymentMethod        string  `json:"payment_method"`
	PaymentProvider      string  `json:"payment_provider"`
	RebatePercentage     float64 `json:"rebate_percentage"`
	QuotaPerUnitSnapshot float64 `json:"quota_per_unit_snapshot"`
	RebateAmount         float64 `json:"rebate_amount"`
	RebateQuota          int     `json:"rebate_quota"`
	FreezeDays           int     `json:"freeze_days"`
	SettleAfter          int64   `json:"settle_after"`
	RiskStatus           string  `json:"risk_status"`
	RefundTradeNo        string  `json:"refund_trade_no"`
	ReversalQuota        int     `json:"reversal_quota"`
	ReversedAt           int64   `json:"reversed_at"`
	Remark               string  `json:"remark"`
	Status               string  `json:"status"`
	CreatedAt            int64   `json:"created_at"`
	SettledAt            int64   `json:"settled_at"`
}

func SettleInvitationRebateTx(tx *gorm.DB, topUp *TopUp) (*InvitationRebate, error) {
	if tx == nil {
		return nil, errors.New("transaction is required")
	}
	if topUp == nil {
		return nil, errors.New("topup is required")
	}
	if topUp.Id == 0 || topUp.Status != common.TopUpStatusSuccess {
		return nil, nil
	}
	if topUp.Money <= 0 || common.InviteRebatePercentage <= 0 {
		return nil, nil
	}

	var existing InvitationRebate
	err := tx.Where("top_up_id = ?", topUp.Id).First(&existing).Error
	if err == nil {
		if existing.Status == InvitationRebateStatusPending && existing.SettleAfter <= common.GetTimestamp() {
			if err = settleInvitationRebateTx(tx, &existing, common.GetTimestamp()); err != nil {
				return nil, err
			}
		}
		return &existing, nil
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	var invitee User
	if err = tx.Select("id", "inviter_id").Where("id = ?", topUp.UserId).First(&invitee).Error; err != nil {
		return nil, err
	}
	if invitee.InviterId == 0 {
		return nil, nil
	}

	rebateAmount := CalculateInvitationRebateAmount(topUp.Money)
	if rebateAmount <= 0 {
		return nil, nil
	}
	rebateQuota := CalculateInvitationRebateQuota(topUp.Money)
	createdAt := topUp.CompleteTime
	if createdAt == 0 {
		createdAt = common.GetTimestamp()
	}
	now := common.GetTimestamp()
	freezeDays := operation_setting.GetGrowthSetting().RebateFreezeDays
	if freezeDays < 0 {
		freezeDays = 0
	}
	settleAfter := createdAt + int64(freezeDays)*24*60*60
	status := InvitationRebateStatusPending
	settledAt := int64(0)
	if freezeDays == 0 || settleAfter <= now {
		status = InvitationRebateStatusSettled
		settledAt = now
		if freezeDays == 0 {
			settledAt = createdAt
		}
	}

	rebate := &InvitationRebate{
		InviterId:            invitee.InviterId,
		InviteeId:            invitee.Id,
		TopUpId:              topUp.Id,
		TradeNo:              topUp.TradeNo,
		TopUpMoney:           topUp.Money,
		PaymentMethod:        topUp.PaymentMethod,
		PaymentProvider:      topUp.PaymentProvider,
		RebatePercentage:     common.InviteRebatePercentage,
		QuotaPerUnitSnapshot: common.QuotaPerUnit,
		RebateAmount:         rebateAmount,
		RebateQuota:          rebateQuota,
		FreezeDays:           freezeDays,
		SettleAfter:          settleAfter,
		RuleSnapshot:         buildInvitationRebateRuleSnapshot(common.InviteRebatePercentage, common.QuotaPerUnit, freezeDays),
		Status:               status,
		CreatedAt:            createdAt,
		SettledAt:            settledAt,
	}
	if err = tx.Create(rebate).Error; err != nil {
		return nil, err
	}

	if rebate.Status == InvitationRebateStatusSettled {
		if err = increaseInvitationRebateQuotaTx(tx, rebate.InviterId, rebate.RebateQuota); err != nil {
			return nil, err
		}
	}

	return rebate, nil
}

func buildInvitationRebateRuleSnapshot(rebatePercentage float64, quotaPerUnit float64, freezeDays int) string {
	snapshot := map[string]interface{}{
		"invite_rebate_percentage": rebatePercentage,
		"quota_per_unit":           quotaPerUnit,
		"rebate_freeze_days":       freezeDays,
	}
	data, err := common.Marshal(snapshot)
	if err != nil {
		return ""
	}
	return string(data)
}

func increaseInvitationRebateQuotaTx(tx *gorm.DB, inviterId int, rebateQuota int) error {
	if rebateQuota <= 0 {
		return nil
	}
	return tx.Model(&User{}).
		Where("id = ?", inviterId).
		Updates(map[string]interface{}{
			"aff_quota":   gorm.Expr("aff_quota + ?", rebateQuota),
			"aff_history": gorm.Expr("aff_history + ?", rebateQuota),
		}).Error
}

func settleInvitationRebateTx(tx *gorm.DB, rebate *InvitationRebate, settledAt int64) error {
	if tx == nil {
		return errors.New("transaction is required")
	}
	if rebate == nil || rebate.Id == 0 || rebate.Status != InvitationRebateStatusPending {
		return nil
	}
	if settledAt <= 0 {
		settledAt = common.GetTimestamp()
	}
	res := tx.Model(&InvitationRebate{}).
		Where("id = ? AND status = ?", rebate.Id, InvitationRebateStatusPending).
		Updates(map[string]interface{}{
			"status":     InvitationRebateStatusSettled,
			"settled_at": settledAt,
		})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return nil
	}
	if err := increaseInvitationRebateQuotaTx(tx, rebate.InviterId, rebate.RebateQuota); err != nil {
		return err
	}
	rebate.Status = InvitationRebateStatusSettled
	rebate.SettledAt = settledAt
	return nil
}

func settleDueInvitationRebatesForInviter(inviterId int) error {
	if inviterId <= 0 {
		return nil
	}
	now := common.GetTimestamp()
	for {
		var rebates []InvitationRebate
		if err := DB.Where("inviter_id = ? AND status = ? AND settle_after <= ?", inviterId, InvitationRebateStatusPending, now).
			Order("id ASC").
			Limit(200).
			Find(&rebates).Error; err != nil {
			return err
		}
		if len(rebates) == 0 {
			return nil
		}
		for _, rebate := range rebates {
			if err := DB.Transaction(func(tx *gorm.DB) error {
				lockedRebate := &InvitationRebate{}
				if err := tx.Set("gorm:query_option", "FOR UPDATE").Where("id = ?", rebate.Id).First(lockedRebate).Error; err != nil {
					return err
				}
				return settleInvitationRebateTx(tx, lockedRebate, now)
			}); err != nil {
				return err
			}
		}
	}
}

func ReverseInvitationRebateByTopUpTx(tx *gorm.DB, topUpId int, refundTradeNo string, remark string) (*InvitationRebate, error) {
	if tx == nil {
		return nil, errors.New("transaction is required")
	}
	if topUpId <= 0 {
		return nil, nil
	}
	rebate := &InvitationRebate{}
	if err := tx.Set("gorm:query_option", "FOR UPDATE").Where("top_up_id = ?", topUpId).First(rebate).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	if rebate.Status == InvitationRebateStatusReversed {
		return rebate, nil
	}

	now := common.GetTimestamp()
	reversalQuota := 0
	if rebate.Status == InvitationRebateStatusSettled && rebate.RebateQuota > 0 {
		reversalQuota = rebate.RebateQuota
		if err := tx.Model(&User{}).
			Where("id = ?", rebate.InviterId).
			Updates(map[string]interface{}{
				"aff_quota":   gorm.Expr("aff_quota - ?", reversalQuota),
				"aff_history": gorm.Expr("aff_history - ?", reversalQuota),
			}).Error; err != nil {
			return nil, err
		}
	}

	if err := tx.Model(&InvitationRebate{}).
		Where("id = ?", rebate.Id).
		Updates(map[string]interface{}{
			"status":          InvitationRebateStatusReversed,
			"refund_trade_no": refundTradeNo,
			"reversal_quota":  reversalQuota,
			"reversed_at":     now,
			"remark":          remark,
		}).Error; err != nil {
		return nil, err
	}
	rebate.Status = InvitationRebateStatusReversed
	rebate.RefundTradeNo = refundTradeNo
	rebate.ReversalQuota = reversalQuota
	rebate.ReversedAt = now
	rebate.Remark = remark
	return rebate, nil
}

func ReverseInvitationRebateByTopUp(topUpId int, refundTradeNo string, remark string) (*InvitationRebate, error) {
	var rebate *InvitationRebate
	err := DB.Transaction(func(tx *gorm.DB) error {
		reversedRebate, err := ReverseInvitationRebateByTopUpTx(tx, topUpId, refundTradeNo, remark)
		if err != nil {
			return err
		}
		rebate = reversedRebate
		return nil
	})
	return rebate, err
}

func RecordInvitationRebateLog(rebate *InvitationRebate) {
	if rebate == nil {
		return
	}

	content := fmt.Sprintf(
		"Invitation rebate %s: %s from user #%d top-up %.2f",
		rebate.Status,
		logger.LogQuota(rebate.RebateQuota),
		rebate.InviteeId,
		rebate.TopUpMoney,
	)
	RecordLog(rebate.InviterId, LogTypeSystem, content)
}

func GetUserInvitationRebateRecords(inviterId int, pageInfo *common.PageInfo) (
	records []*UserInvitationRebateRecord,
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

	err = tx.Model(&InvitationRebate{}).Where("inviter_id = ?", inviterId).Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	err = tx.Table("invitation_rebates").
		Select("invitation_rebates.id, invitation_rebates.invitee_id, invitation_rebates.trade_no, invitation_rebates.top_up_money, invitation_rebates.payment_method, invitation_rebates.payment_provider, invitation_rebates.rebate_percentage, invitation_rebates.quota_per_unit_snapshot, invitation_rebates.rebate_amount, invitation_rebates.rebate_quota, invitation_rebates.freeze_days, invitation_rebates.settle_after, invitation_rebates.risk_status, invitation_rebates.refund_trade_no, invitation_rebates.reversal_quota, invitation_rebates.reversed_at, invitation_rebates.remark, invitation_rebates.status, invitation_rebates.created_at, invitation_rebates.settled_at, COALESCE(NULLIF(users.display_name, ''), users.username) AS invitee_name").
		Joins("LEFT JOIN users ON users.id = invitation_rebates.invitee_id").
		Where("invitation_rebates.inviter_id = ?", inviterId).
		Order("invitation_rebates.id DESC").
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

func SyncInvitationRebatesForInviter(inviterId int) error {
	if inviterId <= 0 {
		return nil
	}
	if err := settleDueInvitationRebatesForInviter(inviterId); err != nil {
		return err
	}
	if common.InviteRebatePercentage <= 0 {
		return nil
	}

	for {
		var topUps []TopUp
		err := DB.Table("top_ups").
			Select("top_ups.id, top_ups.user_id, top_ups.amount, top_ups.money, top_ups.trade_no, top_ups.payment_method, top_ups.payment_provider, top_ups.create_time, top_ups.complete_time, top_ups.status").
			Joins("INNER JOIN users ON users.id = top_ups.user_id").
			Joins("LEFT JOIN invitation_rebates ON invitation_rebates.top_up_id = top_ups.id").
			Joins("LEFT JOIN subscription_orders ON subscription_orders.trade_no = top_ups.trade_no").
			Where("users.inviter_id = ? AND top_ups.status = ? AND invitation_rebates.id IS NULL AND subscription_orders.id IS NULL", inviterId, common.TopUpStatusSuccess).
			Order("top_ups.id ASC").
			Limit(200).
			Scan(&topUps).Error
		if err != nil {
			return err
		}
		if len(topUps) == 0 {
			return nil
		}

		for _, topUp := range topUps {
			err = DB.Transaction(func(tx *gorm.DB) error {
				lockedTopUp := &TopUp{}
				if err := tx.Set("gorm:query_option", "FOR UPDATE").Where("id = ?", topUp.Id).First(lockedTopUp).Error; err != nil {
					return err
				}
				_, err := SettleInvitationRebateTx(tx, lockedTopUp)
				return err
			})
			if err != nil {
				return err
			}
		}
	}
}
