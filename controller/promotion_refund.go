package controller

import (
	"context"
	"fmt"

	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
)

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func reverseInvitationRebateByTradeNoFromWebhook(ctx context.Context, provider string, tradeNo string, refundTradeNo string, remark string) bool {
	if tradeNo == "" {
		logger.LogWarn(ctx, fmt.Sprintf("%s 退款/拒付回调缺少本地订单号，跳过推广返佣冲正 refund_trade_no=%s", provider, refundTradeNo))
		return false
	}
	rebate, err := model.ReverseInvitationRebateByTradeNo(tradeNo, refundTradeNo, remark)
	if err != nil {
		logger.LogError(ctx, fmt.Sprintf("%s 推广返佣冲正失败 trade_no=%s refund_trade_no=%s error=%q", provider, tradeNo, refundTradeNo, err.Error()))
		return false
	}
	if rebate == nil {
		logger.LogInfo(ctx, fmt.Sprintf("%s 退款/拒付订单无推广返佣可冲正 trade_no=%s refund_trade_no=%s", provider, tradeNo, refundTradeNo))
		return true
	}
	model.RecordInvitationRebateLog(rebate)
	logger.LogInfo(ctx, fmt.Sprintf("%s 推广返佣已冲正 trade_no=%s refund_trade_no=%s rebate_id=%d inviter_id=%d", provider, tradeNo, refundTradeNo, rebate.Id, rebate.InviterId))
	return true
}
