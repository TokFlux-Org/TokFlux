package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

// Vendor 用于存储供应商信息，供模型引用
// Name 唯一，用于在模型中关联
// Icon 采用 @lobehub/icons 的图标名，前端可直接渲染
// Status 预留字段，1 表示启用
// 本表同样遵循 3NF 设计范式

type Vendor struct {
	Id          int            `json:"id"`
	Name        string         `json:"name" gorm:"size:128;not null;uniqueIndex:uk_vendor_name_delete_at,priority:1"`
	Description string         `json:"description,omitempty" gorm:"type:text"`
	Icon        string         `json:"icon,omitempty" gorm:"type:varchar(128)"`
	Status      int            `json:"status" gorm:"default:1"`
	CreatedTime int64          `json:"created_time" gorm:"bigint"`
	UpdatedTime int64          `json:"updated_time" gorm:"bigint"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index;uniqueIndex:uk_vendor_name_delete_at,priority:2"`
}

// Insert 创建新的供应商记录
func (v *Vendor) Insert() error {
	now := common.GetTimestamp()
	v.CreatedTime = now
	v.UpdatedTime = now
	return DB.Create(v).Error
}

// IsVendorNameDuplicated 检查供应商名称是否重复（排除自身 ID）
func IsVendorNameDuplicated(id int, name string) (bool, error) {
	if name == "" {
		return false, nil
	}
	var cnt int64
	err := DB.Model(&Vendor{}).Where("name = ? AND id <> ?", name, id).Count(&cnt).Error
	return cnt > 0, err
}

// Update 更新供应商记录
func (v *Vendor) Update() error {
	v.UpdatedTime = common.GetTimestamp()
	return DB.Save(v).Error
}

// Delete 软删除供应商
func (v *Vendor) Delete() error {
	return DB.Delete(v).Error
}

// GetVendorByID 根据 ID 获取供应商
func GetVendorByID(id int) (*Vendor, error) {
	var v Vendor
	err := DB.First(&v, id).Error
	if err != nil {
		return nil, err
	}
	return &v, nil
}

// GetAllVendors 获取全部供应商（分页）
func GetAllVendors(offset int, limit int) ([]*Vendor, error) {
	var vendors []*Vendor
	err := DB.Offset(offset).Limit(limit).Find(&vendors).Error
	return vendors, err
}

// SearchVendors 按关键字搜索供应商
func SearchVendors(keyword string, offset int, limit int) ([]*Vendor, int64, error) {
	db := DB.Model(&Vendor{})
	if keyword != "" {
		like := "%" + keyword + "%"
		db = db.Where("name LIKE ? OR description LIKE ?", like, like)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var vendors []*Vendor
	if err := db.Offset(offset).Limit(limit).Order("id DESC").Find(&vendors).Error; err != nil {
		return nil, 0, err
	}
	return vendors, total, nil
}

func migrateXiaomiMiMoVendorName() error {
	const oldName = "MiMO"
	const newName = "Xiaomi MiMo"
	const icon = "XiaomiMiMo"

	var oldVendor Vendor
	err := DB.Where("name = ?", oldName).First(&oldVendor).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		var existing Vendor
		if err := DB.Where("name = ?", newName).First(&existing).Error; err == nil && existing.Icon == "" {
			return DB.Model(&Vendor{}).Where("id = ?", existing.Id).Updates(map[string]interface{}{
				"icon":         icon,
				"updated_time": common.GetTimestamp(),
			}).Error
		}
		return nil
	}
	if err != nil {
		return err
	}

	var newVendor Vendor
	err = DB.Where("name = ?", newName).First(&newVendor).Error
	if err == nil {
		if err := DB.Model(&Model{}).Where("vendor_id = ?", oldVendor.Id).Update("vendor_id", newVendor.Id).Error; err != nil {
			return err
		}
		if newVendor.Icon == "" {
			if err := DB.Model(&Vendor{}).Where("id = ?", newVendor.Id).Updates(map[string]interface{}{
				"icon":         icon,
				"updated_time": common.GetTimestamp(),
			}).Error; err != nil {
				return err
			}
		}
		return DB.Delete(&oldVendor).Error
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	return DB.Model(&Vendor{}).Where("id = ?", oldVendor.Id).Updates(map[string]interface{}{
		"name":         newName,
		"icon":         icon,
		"updated_time": common.GetTimestamp(),
	}).Error
}
