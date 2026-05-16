package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

type adminGrowthRewardItemRequest struct {
	Code        string `json:"code"`
	Title       string `json:"title"`
	Description string `json:"description"`
	RewardQuota int    `json:"reward_quota"`
	ItemType    string `json:"item_type"`
	Enabled     bool   `json:"enabled"`
	OncePerUser bool   `json:"once_per_user"`
	DailyLimit  int    `json:"daily_limit"`
}

type rejectGrowthSubmissionRequest struct {
	ReviewNote string `json:"review_note"`
}

func GetGrowthSummary(c *gin.Context) {
	summary, err := service.GetGrowthSummary(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, summary)
}

func GetGrowthRewardItems(c *gin.Context) {
	items, err := service.ListGrowthRewardItemsForUser(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, items)
}

func ClaimGrowthRewardItem(c *gin.Context) {
	reward, err := service.ClaimGrowthRewardItem(c.GetInt("id"), c.Param("code"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, reward)
}

func GetGrowthRewards(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	rewards, total, err := service.ListGrowthRewards(c.GetInt("id"), pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(rewards)
	common.ApiSuccess(c, pageInfo)
}

func CreateGrowthSubmission(c *gin.Context) {
	var req service.GrowthSubmissionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	submission, err := service.CreateGrowthSubmission(c.GetInt("id"), req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, submission)
}

func GetGrowthSubmissions(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	submissions, total, err := service.ListGrowthSubmissions(c.GetInt("id"), pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(submissions)
	common.ApiSuccess(c, pageInfo)
}

func AdminGetGrowthRewardItems(c *gin.Context) {
	if err := service.EnsureDefaultGrowthRewardItems(); err != nil {
		common.ApiError(c, err)
		return
	}
	var items []*model.GrowthRewardItem
	if err := model.DB.Order("id ASC").Find(&items).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, items)
}

func AdminCreateGrowthRewardItem(c *gin.Context) {
	var req adminGrowthRewardItemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	item := &model.GrowthRewardItem{
		Code:        req.Code,
		Title:       req.Title,
		Description: req.Description,
		RewardQuota: req.RewardQuota,
		ItemType:    req.ItemType,
		Enabled:     req.Enabled,
		OncePerUser: req.OncePerUser,
		DailyLimit:  req.DailyLimit,
	}
	if err := model.DB.Create(item).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, item)
}

func AdminUpdateGrowthRewardItem(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var item model.GrowthRewardItem
	if err = model.DB.Where("id = ?", id).First(&item).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var req adminGrowthRewardItemRequest
	if err = c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	item.Code = req.Code
	item.Title = req.Title
	item.Description = req.Description
	item.RewardQuota = req.RewardQuota
	item.ItemType = req.ItemType
	item.Enabled = req.Enabled
	item.OncePerUser = req.OncePerUser
	item.DailyLimit = req.DailyLimit
	if err = model.DB.Save(&item).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, item)
}

func AdminGetGrowthRewards(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	rewards, total, err := service.AdminListGrowthRewards(pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(rewards)
	common.ApiSuccess(c, pageInfo)
}

func AdminGetGrowthSubmissions(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	submissions, total, err := service.AdminListGrowthSubmissions(pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(submissions)
	common.ApiSuccess(c, pageInfo)
}

func AdminApproveGrowthSubmission(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var req service.GrowthReviewRequest
	if err = c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	submission, err := service.ApproveGrowthSubmission(id, c.GetInt("id"), req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, submission)
}

func AdminRejectGrowthSubmission(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var req rejectGrowthSubmissionRequest
	if err = c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	submission, err := service.RejectGrowthSubmission(id, c.GetInt("id"), req.ReviewNote)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, submission)
}

func AdminGetGrowthStats(c *gin.Context) {
	stats, err := service.GetGrowthAdminStats()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    stats,
	})
}
