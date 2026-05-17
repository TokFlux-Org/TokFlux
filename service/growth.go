package service

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
)

type GrowthSummary struct {
	AvailableRewardQuota int64   `json:"available_reward_quota"`
	PendingRewardQuota   int64   `json:"pending_reward_quota"`
	TotalRewardQuota     int64   `json:"total_reward_quota"`
	InviteCount          int     `json:"invite_count"`
	MonthlyRebateQuota   int64   `json:"monthly_rebate_quota"`
	TotalRebateQuota     int     `json:"total_rebate_quota"`
	AffCode              string  `json:"aff_code"`
	InviteRebatePercent  float64 `json:"invite_rebate_percent"`
}

type GrowthRewardItemStatus struct {
	*model.GrowthRewardItem
	RewardQuota    int    `json:"reward_quota"`
	RewardQuotaMin int    `json:"reward_quota_min"`
	RewardQuotaMax int    `json:"reward_quota_max"`
	Status         string `json:"status"`
	Claimable      bool   `json:"claimable"`
	Reason         string `json:"reason,omitempty"`
}

type GrowthSubmissionRequest struct {
	ItemCode       string `json:"item_code"`
	LegacyTaskCode string `json:"task_code"`
	Platform       string `json:"platform"`
	Url            string `json:"url" binding:"required"`
	Remark         string `json:"remark"`
}

type GrowthReviewRequest struct {
	RewardQuota int    `json:"reward_quota"`
	ReviewNote  string `json:"review_note"`
}

func EnsureDefaultGrowthRewardItems() error {
	for _, item := range model.GetDefaultGrowthRewardItems() {
		row := *item
		if err := model.DB.Where("code = ?", item.Code).FirstOrCreate(&row).Error; err != nil {
			return err
		}
	}
	if err := model.DB.Model(&model.GrowthRewardItem{}).
		Where("code = ? AND item_type <> ?", model.GrowthRewardItemJoinCommunity, model.GrowthRewardItemTypeAuto).
		Update("item_type", model.GrowthRewardItemTypeAuto).Error; err != nil {
		return err
	}
	return nil
}

func GetGrowthSummary(userId int) (*GrowthSummary, error) {
	if err := model.SyncInvitationRebatesForInviter(userId); err != nil {
		return nil, err
	}
	user, err := model.GetUserById(userId, true)
	if err != nil {
		return nil, err
	}
	rewardSummary, err := model.GetGrowthRewardSummary(userId)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).Unix()
	var monthlyRebate int64
	if err := model.DB.Model(&model.InvitationRebate{}).
		Where("inviter_id = ? AND status = ? AND settled_at >= ?", userId, model.InvitationRebateStatusSettled, monthStart).
		Select("COALESCE(SUM(rebate_quota), 0)").
		Scan(&monthlyRebate).Error; err != nil {
		return nil, err
	}
	var monthlyInvitationReward int64
	if err := model.DB.Model(&model.InvitationReward{}).
		Where("inviter_id = ? AND status = ? AND settled_at >= ?", userId, model.InvitationRewardStatusSettled, monthStart).
		Select("COALESCE(SUM(reward_quota), 0)").
		Scan(&monthlyInvitationReward).Error; err != nil {
		return nil, err
	}
	var pendingInvitationRebate int64
	if err := model.DB.Model(&model.InvitationRebate{}).
		Where("inviter_id = ? AND status = ?", userId, model.InvitationRebateStatusPending).
		Select("COALESCE(SUM(rebate_quota), 0)").
		Scan(&pendingInvitationRebate).Error; err != nil {
		return nil, err
	}

	return &GrowthSummary{
		AvailableRewardQuota: rewardSummary.AvailableRewardQuota,
		PendingRewardQuota:   rewardSummary.PendingRewardQuota + pendingInvitationRebate,
		TotalRewardQuota:     rewardSummary.TotalRewardQuota,
		InviteCount:          user.AffCount,
		MonthlyRebateQuota:   monthlyRebate + monthlyInvitationReward,
		TotalRebateQuota:     user.AffHistoryQuota,
		AffCode:              user.AffCode,
		InviteRebatePercent:  common.InviteRebatePercentage,
	}, nil
}

func ListGrowthRewardItemsForUser(userId int) ([]*GrowthRewardItemStatus, error) {
	if err := EnsureDefaultGrowthRewardItems(); err != nil {
		return nil, err
	}
	growthSetting := operation_setting.GetGrowthSetting()
	checkinSetting := operation_setting.GetCheckinSetting()
	var rewardItems []*model.GrowthRewardItem
	if err := model.DB.Order("id ASC").Find(&rewardItems).Error; err != nil {
		return nil, err
	}
	items := make([]*GrowthRewardItemStatus, 0, len(rewardItems))
	for _, item := range rewardItems {
		if shouldHideGrowthRewardItem(item, growthSetting, checkinSetting) {
			continue
		}
		rewardQuotaMin, rewardQuotaMax := resolveGrowthRewardQuotaRange(item)
		rewardQuota := rewardQuotaMin
		if rewardQuota <= 0 && item.Code != model.GrowthRewardItemDailyCheckin {
			continue
		}
		status := "not_available"
		claimable := false
		reason := ""

		if item.ItemType == model.GrowthRewardItemTypeManual || item.ItemType == model.GrowthRewardItemTypeSemiAuto {
			status, reason = submissionStatus(userId, item)
		} else {
			completed, err := rewardItemCompleted(userId, item)
			if err != nil {
				return nil, err
			}
			if completed {
				status = "completed"
			} else {
				ok, msg, err := canClaimAutoRewardItem(userId, item)
				if err != nil {
					return nil, err
				}
				if ok {
					status = "available"
					claimable = true
				} else {
					reason = msg
				}
			}
		}

		items = append(items, &GrowthRewardItemStatus{
			GrowthRewardItem: item,
			RewardQuota:      rewardQuota,
			RewardQuotaMin:   rewardQuotaMin,
			RewardQuotaMax:   rewardQuotaMax,
			Status:           status,
			Claimable:        claimable,
			Reason:           reason,
		})
	}
	return items, nil
}

func shouldHideGrowthRewardItem(item *model.GrowthRewardItem, growthSetting *operation_setting.GrowthSetting, checkinSetting *operation_setting.CheckinSetting) bool {
	if item == nil || !item.Enabled {
		return true
	}
	if item.Code == model.GrowthRewardItemDailyCheckin {
		return !checkinSetting.Enabled
	}
	if item.Code == model.GrowthRewardItemThreeDayUsage || item.Code == model.GrowthRewardItemMonthlySpendTarget {
		return true
	}
	if item.ItemType == model.GrowthRewardItemTypeManual || item.ItemType == model.GrowthRewardItemTypeSemiAuto {
		return !growthSetting.SubmissionEnabled
	}
	return !growthSetting.Enabled
}

func ClaimGrowthRewardItem(userId int, code string, password string) (*model.GrowthReward, error) {
	item, err := getGrowthRewardItem(code)
	if err != nil {
		return nil, err
	}
	if !item.Enabled {
		return nil, errors.New("reward item disabled")
	}
	if item.ItemType != model.GrowthRewardItemTypeAuto {
		return nil, errors.New("this reward item requires submission review")
	}
	if err := validateGrowthRewardClaimPassword(item, password); err != nil {
		return nil, err
	}

	if item.Code == model.GrowthRewardItemDailyCheckin {
		return claimDailyCheckin(userId, item)
	}

	if !operation_setting.GetGrowthSetting().Enabled {
		return nil, errors.New("growth rewards are not enabled")
	}
	completed, err := rewardItemCompleted(userId, item)
	if err != nil {
		return nil, err
	}
	if completed {
		return nil, errors.New("reward item already completed")
	}
	ok, msg, err := canClaimAutoRewardItem(userId, item)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errors.New(msg)
	}
	rewardQuota := resolveGrowthRewardQuota(item)
	if err := checkRewardBudget(userId, rewardQuota); err != nil {
		return nil, err
	}

	reward, err := model.CreateSettledGrowthReward(userId, item.Code, rewardQuota, 0, item.Title)
	if err != nil {
		return nil, err
	}
	model.RecordLog(userId, model.LogTypeSystem, fmt.Sprintf("Growth reward settled: %s for %s", logger.LogQuota(rewardQuota), item.Code))
	return reward, nil
}

func ListGrowthRewards(userId int, pageInfo *common.PageInfo) ([]*model.GrowthReward, int64, error) {
	return model.ListGrowthRewards(userId, pageInfo)
}

func CreateGrowthSubmission(userId int, req GrowthSubmissionRequest) (*model.GrowthSubmission, error) {
	if !operation_setting.GetGrowthSetting().SubmissionEnabled {
		return nil, errors.New("growth submissions are not enabled")
	}
	itemCode := req.ItemCode
	if itemCode == "" {
		itemCode = req.LegacyTaskCode
	}
	if itemCode == "" {
		return nil, errors.New("reward item is required")
	}
	item, err := getGrowthRewardItem(itemCode)
	if err != nil {
		return nil, err
	}
	if !item.Enabled {
		return nil, errors.New("reward item disabled")
	}
	if item.ItemType == model.GrowthRewardItemTypeAuto {
		return nil, errors.New("this reward item does not accept submissions")
	}
	if item.OncePerUser {
		var count int64
		if err := model.DB.Model(&model.GrowthSubmission{}).
			Where("user_id = ? AND item_code = ? AND status <> ?", userId, item.Code, model.GrowthSubmissionStatusRejected).
			Count(&count).Error; err != nil {
			return nil, err
		}
		if count > 0 {
			return nil, errors.New("submission already exists")
		}
	}

	submission := &model.GrowthSubmission{
		UserId:   userId,
		ItemCode: item.Code,
		Platform: req.Platform,
		Url:      req.Url,
		Remark:   req.Remark,
		Status:   model.GrowthSubmissionStatusPending,
	}
	if err := model.DB.Create(submission).Error; err != nil {
		return nil, err
	}
	return submission, nil
}

func ListGrowthSubmissions(userId int, pageInfo *common.PageInfo) ([]*model.GrowthSubmission, int64, error) {
	return model.ListGrowthSubmissions(userId, pageInfo)
}

func AdminListGrowthRewards(pageInfo *common.PageInfo) ([]*model.GrowthReward, int64, error) {
	var total int64
	if err := model.DB.Model(&model.GrowthReward{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rewards []*model.GrowthReward
	err := model.DB.Order("id DESC").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&rewards).Error
	return rewards, total, err
}

func AdminListGrowthSubmissions(pageInfo *common.PageInfo) ([]*model.GrowthSubmission, int64, error) {
	var total int64
	if err := model.DB.Model(&model.GrowthSubmission{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var submissions []*model.GrowthSubmission
	err := model.DB.Order("id DESC").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&submissions).Error
	return submissions, total, err
}

func ApproveGrowthSubmission(id int, reviewerId int, req GrowthReviewRequest) (*model.GrowthSubmission, error) {
	var submission model.GrowthSubmission
	if err := model.DB.Where("id = ?", id).First(&submission).Error; err != nil {
		return nil, err
	}
	if submission.Status != model.GrowthSubmissionStatusPending {
		return nil, errors.New("submission already reviewed")
	}
	item, err := getGrowthRewardItem(submission.ItemCode)
	if err != nil {
		return nil, err
	}
	rewardQuota := req.RewardQuota
	if rewardQuota <= 0 {
		rewardQuota = resolveGrowthRewardQuota(item)
	}
	if rewardQuota <= 0 {
		rewardQuota = operation_setting.GetGrowthSetting().SubmissionMinRewardQuota
	}
	now := time.Now().Unix()
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.GrowthSubmission{}).
			Where("id = ?", submission.Id).
			Updates(map[string]interface{}{
				"status":      model.GrowthSubmissionStatusApproved,
				"reviewer_id": reviewerId,
				"review_note": req.ReviewNote,
				"reviewed_at": now,
			}).Error; err != nil {
			return err
		}
		reward := &model.GrowthReward{
			UserId:      submission.UserId,
			ItemCode:    submission.ItemCode,
			RewardQuota: rewardQuota,
			Status:      model.GrowthRewardStatusSettled,
			SourceId:    submission.Id,
			AvailableAt: now,
			CreatedAt:   now,
			SettledAt:   now,
			Remark:      req.ReviewNote,
		}
		if err := tx.Create(reward).Error; err != nil {
			return err
		}
		if rewardQuota > 0 {
			return tx.Model(&model.User{}).Where("id = ?", submission.UserId).
				Update("quota", gorm.Expr("quota + ?", rewardQuota)).Error
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if err := model.DB.Where("id = ?", id).First(&submission).Error; err != nil {
		return nil, err
	}
	_ = model.InvalidateUserCache(submission.UserId)
	model.RecordLog(submission.UserId, model.LogTypeSystem, fmt.Sprintf("Growth submission approved: %s for %s", logger.LogQuota(rewardQuota), submission.ItemCode))
	return &submission, nil
}

func RejectGrowthSubmission(id int, reviewerId int, note string) (*model.GrowthSubmission, error) {
	var submission model.GrowthSubmission
	if err := model.DB.Where("id = ?", id).First(&submission).Error; err != nil {
		return nil, err
	}
	if submission.Status != model.GrowthSubmissionStatusPending {
		return nil, errors.New("submission already reviewed")
	}
	err := model.DB.Model(&model.GrowthSubmission{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"status":      model.GrowthSubmissionStatusRejected,
			"reviewer_id": reviewerId,
			"review_note": note,
			"reviewed_at": time.Now().Unix(),
		}).Error
	if err != nil {
		return nil, err
	}
	if err := model.DB.Where("id = ?", id).First(&submission).Error; err != nil {
		return nil, err
	}
	return &submission, nil
}

func GetGrowthAdminStats() (map[string]interface{}, error) {
	stats := map[string]interface{}{}
	var totalRewards int64
	var pendingSubmissions int64
	var totalRewardQuota int64
	if err := model.DB.Model(&model.GrowthReward{}).Count(&totalRewards).Error; err != nil {
		return nil, err
	}
	if err := model.DB.Model(&model.GrowthSubmission{}).Where("status = ?", model.GrowthSubmissionStatusPending).Count(&pendingSubmissions).Error; err != nil {
		return nil, err
	}
	if err := model.DB.Model(&model.GrowthReward{}).
		Where("status IN ?", []string{model.GrowthRewardStatusSettled, model.GrowthRewardStatusTransferred}).
		Select("COALESCE(SUM(reward_quota), 0)").
		Scan(&totalRewardQuota).Error; err != nil {
		return nil, err
	}
	stats["total_rewards"] = totalRewards
	stats["pending_submissions"] = pendingSubmissions
	stats["total_reward_quota"] = totalRewardQuota
	return stats, nil
}

func getGrowthRewardItem(code string) (*model.GrowthRewardItem, error) {
	if err := EnsureDefaultGrowthRewardItems(); err != nil {
		return nil, err
	}
	var item model.GrowthRewardItem
	err := model.DB.Where("code = ?", code).First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errors.New("reward item not found")
	}
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func resolveGrowthRewardQuota(item *model.GrowthRewardItem) int {
	minQuota, _ := resolveGrowthRewardQuotaRange(item)
	return minQuota
}

func resolveGrowthRewardQuotaRange(item *model.GrowthRewardItem) (int, int) {
	if item.RewardQuota > 0 {
		return item.RewardQuota, item.RewardQuota
	}
	setting := operation_setting.GetGrowthSetting()
	switch item.Code {
	case model.GrowthRewardItemDailyCheckin:
		checkinSetting := operation_setting.GetCheckinSetting()
		if checkinSetting.Enabled {
			return normalizeRewardQuotaRange(checkinSetting.MinQuota, checkinSetting.MaxQuota)
		}
		return 0, 0
	case model.GrowthRewardItemCreateFirstAPIKey:
		return setting.FirstAPIKeyRewardQuota, setting.FirstAPIKeyRewardQuota
	case model.GrowthRewardItemFirstAPIRequest:
		return setting.FirstAPIRequestRewardQuota, setting.FirstAPIRequestRewardQuota
	case model.GrowthRewardItemFirstTopUp:
		return setting.FirstTopUpRewardQuota, setting.FirstTopUpRewardQuota
	case model.GrowthRewardItemThreeDayUsage:
		return setting.ThreeDayUsageRewardQuota, setting.ThreeDayUsageRewardQuota
	case model.GrowthRewardItemMonthlySpendTarget:
		return setting.MonthlySpendRewardQuota, setting.MonthlySpendRewardQuota
	case model.GrowthRewardItemContentPublish, model.GrowthRewardItemBacklinkSubmission:
		return normalizeRewardQuotaRange(setting.SubmissionMinRewardQuota, setting.SubmissionMaxRewardQuota)
	case model.GrowthRewardItemJoinCommunity:
		return setting.SubmissionMinRewardQuota, setting.SubmissionMinRewardQuota
	default:
		return 0, 0
	}
}

func normalizeRewardQuotaRange(minQuota int, maxQuota int) (int, int) {
	if maxQuota <= 0 || maxQuota < minQuota {
		return minQuota, minQuota
	}
	return minQuota, maxQuota
}

func rewardItemCompleted(userId int, item *model.GrowthRewardItem) (bool, error) {
	if item.Code == model.GrowthRewardItemDailyCheckin {
		todayStart := startOfToday()
		count, err := model.CountGrowthRewardsSince(userId, item.Code, todayStart)
		return count > 0, err
	}
	if item.OncePerUser {
		return model.HasGrowthReward(userId, item.Code)
	}
	return false, nil
}

func canClaimAutoRewardItem(userId int, item *model.GrowthRewardItem) (bool, string, error) {
	switch item.Code {
	case model.GrowthRewardItemDailyCheckin:
		checked, err := model.HasCheckedInToday(userId)
		return !checked, "Already checked in today", err
	case model.GrowthRewardItemCreateFirstAPIKey:
		count, err := model.CountUserTokens(userId)
		return count > 0, "Create an API key first", err
	case model.GrowthRewardItemFirstAPIRequest:
		var count int
		err := model.DB.Model(&model.User{}).Where("id = ?", userId).Select("request_count").Scan(&count).Error
		return count > 0, "Complete one API request first", err
	case model.GrowthRewardItemFirstTopUp:
		var count int64
		err := model.DB.Model(&model.TopUp{}).
			Where("user_id = ? AND status = ?", userId, common.TopUpStatusSuccess).
			Count(&count).Error
		return count > 0, "Complete your first top-up first", err
	case model.GrowthRewardItemJoinCommunity:
		return true, "", nil
	default:
		return false, "This automatic reward item is not available yet", nil
	}
}

func validateGrowthRewardClaimPassword(item *model.GrowthRewardItem, password string) error {
	if item.Code != model.GrowthRewardItemJoinCommunity || item.ClaimPassword == "" {
		return nil
	}
	if strings.TrimSpace(password) != strings.TrimSpace(item.ClaimPassword) {
		return errors.New("Invalid task password")
	}
	return nil
}

func claimDailyCheckin(userId int, item *model.GrowthRewardItem) (*model.GrowthReward, error) {
	completed, err := rewardItemCompleted(userId, item)
	if err != nil {
		return nil, err
	}
	if completed {
		return nil, errors.New("already checked in today")
	}
	checkin, err := model.UserCheckin(userId)
	if err != nil {
		return nil, err
	}
	now := time.Now().Unix()
	reward := &model.GrowthReward{
		UserId:      userId,
		ItemCode:    item.Code,
		RewardQuota: checkin.QuotaAwarded,
		Status:      model.GrowthRewardStatusSettled,
		SourceId:    checkin.Id,
		AvailableAt: now,
		CreatedAt:   now,
		SettledAt:   now,
		Remark:      item.Title,
	}
	if err := model.DB.Create(reward).Error; err != nil {
		return nil, err
	}
	model.RecordLog(userId, model.LogTypeSystem, fmt.Sprintf("用户签到，获得额度 %s", logger.LogQuota(checkin.QuotaAwarded)))
	return reward, nil
}

func submissionStatus(userId int, item *model.GrowthRewardItem) (string, string) {
	var submission model.GrowthSubmission
	err := model.DB.Where("user_id = ? AND item_code = ?", userId, item.Code).Order("id DESC").First(&submission).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "available", ""
	}
	if err != nil {
		return "not_available", err.Error()
	}
	switch submission.Status {
	case model.GrowthSubmissionStatusPending:
		return "pending_review", ""
	case model.GrowthSubmissionStatusApproved:
		return "completed", ""
	case model.GrowthSubmissionStatusRejected:
		return "available", "Previous submission was rejected"
	default:
		return "not_available", ""
	}
}

func checkRewardBudget(userId int, rewardQuota int) error {
	if rewardQuota <= 0 {
		return nil
	}
	setting := operation_setting.GetGrowthSetting()
	todayStart := startOfToday()
	if setting.UserDailyRewardLimitQuota > 0 {
		var total int64
		if err := model.DB.Model(&model.GrowthReward{}).
			Where("user_id = ? AND created_at >= ? AND status IN ?", userId, todayStart, []string{model.GrowthRewardStatusPending, model.GrowthRewardStatusSettled}).
			Select("COALESCE(SUM(reward_quota), 0)").
			Scan(&total).Error; err != nil {
			return err
		}
		if total+int64(rewardQuota) > int64(setting.UserDailyRewardLimitQuota) {
			return errors.New("daily user reward limit reached")
		}
	}
	if setting.SiteDailyBudgetQuota > 0 {
		var total int64
		if err := model.DB.Model(&model.GrowthReward{}).
			Where("created_at >= ? AND status IN ?", todayStart, []string{model.GrowthRewardStatusPending, model.GrowthRewardStatusSettled}).
			Select("COALESCE(SUM(reward_quota), 0)").
			Scan(&total).Error; err != nil {
			return err
		}
		if total+int64(rewardQuota) > int64(setting.SiteDailyBudgetQuota) {
			return errors.New("daily site reward budget reached")
		}
	}
	return nil
}

func startOfToday() int64 {
	now := time.Now()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Unix()
}
