package model

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestMigrateRemovedMiMoChannelTypesRestoresNumbersIdempotently(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Channel{}, &Option{}))

	channels := []Channel{
		{Id: 1, Type: 58, Key: "legacy-advanced-custom"},
		{Id: 2, Type: 59, Key: "shifted-advanced-custom"},
		{Id: 3, Type: 60, Key: "shifted-sub2api"},
		{Id: 4, Type: 61, Key: "shifted-new-api"},
		{Id: 5, Type: 62, Key: "shifted-task-plugin"},
	}
	require.NoError(t, db.Create(&channels).Error)

	require.NoError(t, migrateRemovedMiMoChannelTypes(db))
	var restored []Channel
	require.NoError(t, db.Order("id").Find(&restored).Error)
	require.Equal(t, []int{58, 58, 59, 60, 61}, []int{
		restored[0].Type,
		restored[1].Type,
		restored[2].Type,
		restored[3].Type,
		restored[4].Type,
	})

	// A second startup must not shift a legitimate, newly-created Sub2API.
	require.NoError(t, db.Create(&Channel{Id: 6, Type: 59, Key: "new-sub2api"}).Error)
	require.NoError(t, migrateRemovedMiMoChannelTypes(db))
	var newChannel Channel
	require.NoError(t, db.First(&newChannel, 6).Error)
	require.Equal(t, 59, newChannel.Type)
}
