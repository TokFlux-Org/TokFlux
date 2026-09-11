package model

import (
	"errors"
	"fmt"

	"gorm.io/gorm"
)

const removedMiMoChannelTypeMigrationKey = "migration.channel_type_mimo_removed.v1"

// migrateRemovedMiMoChannelTypes restores the channel type numbers that were
// shifted when the short-lived MiMo channel was inserted at type 58.
//
// The marker makes this safe to run on every startup: after the first run, a
// newly-created channel with type 59 must remain Sub2API rather than being
// shifted again.
func migrateRemovedMiMoChannelTypes(db *gorm.DB) error {
	if db == nil {
		return errors.New("migrate removed MiMo channel types: database is nil")
	}
	if !db.Migrator().HasTable(&Channel{}) || !db.Migrator().HasTable(&Option{}) {
		return nil
	}

	return db.Transaction(func(tx *gorm.DB) error {
		var marker Option
		err := tx.Where(&Option{Key: removedMiMoChannelTypeMigrationKey}).First(&marker).Error
		if err == nil {
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("read MiMo channel type migration marker: %w", err)
		}

		// Use one CASE expression so rows cannot be remapped more than once by
		// an earlier update in the same migration.
		// Keep the numeric literals in the expression (rather than bound
		// parameters) so PostgreSQL infers the CASE result as a bigint instead
		// of text. The values are fixed migration constants, not user input.
		mapping := gorm.Expr("CASE type WHEN 59 THEN 58 WHEN 60 THEN 59 WHEN 61 THEN 60 WHEN 62 THEN 61 END")
		if err := tx.Model(&Channel{}).
			Where("type IN ?", []int{59, 60, 61, 62}).
			Update("type", mapping).Error; err != nil {
			return fmt.Errorf("restore channel type numbers: %w", err)
		}

		if err := tx.Create(&Option{Key: removedMiMoChannelTypeMigrationKey, Value: "1"}).Error; err != nil {
			return fmt.Errorf("write MiMo channel type migration marker: %w", err)
		}
		return nil
	})
}
