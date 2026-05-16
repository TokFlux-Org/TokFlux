package model

import (
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	GrowthSubmissionStatusPending  = "pending"
	GrowthSubmissionStatusApproved = "approved"
	GrowthSubmissionStatusRejected = "rejected"
)

type GrowthSubmission struct {
	Id         int    `json:"id" gorm:"primaryKey"`
	UserId     int    `json:"user_id" gorm:"index;not null"`
	ItemCode   string `json:"item_code" gorm:"type:varchar(64);index;not null"`
	Platform   string `json:"platform" gorm:"type:varchar(64)"`
	Url        string `json:"url" gorm:"type:text"`
	Remark     string `json:"remark" gorm:"type:text"`
	Status     string `json:"status" gorm:"type:varchar(32);index;not null"`
	ReviewerId int    `json:"reviewer_id" gorm:"index;default:0"`
	ReviewNote string `json:"review_note" gorm:"type:text"`
	CreatedAt  int64  `json:"created_at" gorm:"bigint;index"`
	ReviewedAt int64  `json:"reviewed_at" gorm:"bigint;index"`
}

func (GrowthSubmission) TableName() string {
	return "growth_submissions"
}

func (submission *GrowthSubmission) BeforeCreate(_ *gorm.DB) error {
	if submission.CreatedAt == 0 {
		submission.CreatedAt = time.Now().Unix()
	}
	if submission.Status == "" {
		submission.Status = GrowthSubmissionStatusPending
	}
	return nil
}

func ListGrowthSubmissions(userId int, pageInfo *common.PageInfo) ([]*GrowthSubmission, int64, error) {
	var total int64
	if err := DB.Model(&GrowthSubmission{}).Where("user_id = ?", userId).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var submissions []*GrowthSubmission
	err := DB.Where("user_id = ?", userId).
		Order("id DESC").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&submissions).Error
	return submissions, total, err
}
