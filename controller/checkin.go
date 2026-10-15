package controller

import (
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

// GetCheckinStatus 获取用户签到状态和历史记录
func GetCheckinStatus(c *gin.Context) {
	growthSetting := operation_setting.GetGrowthSetting()
	if !growthSetting.DailyCheckinEnabled {
		common.ApiErrorT(c, "Check-in feature is not enabled")
		return
	}
	userId := c.GetInt("id")
	// 获取月份参数，默认为当前月份
	month := c.DefaultQuery("month", time.Now().Format("2006-01"))

	stats, err := service.GetCheckinStats(userId, month)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"enabled":   growthSetting.DailyCheckinEnabled,
			"min_quota": growthSetting.DailyCheckinMinRewardQuota,
			"max_quota": growthSetting.DailyCheckinMaxRewardQuota,
			"stats":     stats,
		},
	})
}

// DoCheckin 执行用户签到
func DoCheckin(c *gin.Context) {
	growthSetting := operation_setting.GetGrowthSetting()
	if !growthSetting.DailyCheckinEnabled {
		common.ApiErrorT(c, "Check-in feature is not enabled")
		return
	}

	userId := c.GetInt("id")

	reward, err := service.ClaimGrowthRewardItem(userId, "daily_checkin", "")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccessT(c, "Check-in successful", gin.H{
		"quota_awarded": reward.RewardQuota,
		"checkin_date": time.Now().Format("2006-01-02"),
	})
}
