package service

import (
	"fmt"
	"maps"
	"net/http/httptest"
	"slices"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func configureRequestAutoGroupsTest(t *testing.T) {
	t.Helper()
	originalMax := setting.GetMaxTokenAutoGroups()
	originalAutoGroups := setting.AutoGroups2JsonString()
	originalUsableGroups := setting.UserUsableGroups2JSONString()
	originalRatios := ratio_setting.GroupRatio2JSONString()
	require.NoError(t, setting.UpdateMaxTokenAutoGroups("2"))
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["vip","default","svip"]`))
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default","vip":"VIP","svip":"SVIP"}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"vip":1,"svip":1}`))
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateMaxTokenAutoGroups(fmt.Sprintf("%d", originalMax)))
		require.NoError(t, setting.UpdateAutoGroupsByJsonString(originalAutoGroups))
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalUsableGroups))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalRatios))
	})
}

func newRequestAutoGroupsContext() *gin.Context {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	return ctx
}

func TestGetRequestAutoGroupsInheritedListIsNotLimited(t *testing.T) {
	configureRequestAutoGroupsTest(t)
	ctx := newRequestAutoGroupsContext()

	groups := GetRequestAutoGroups(ctx, "default")

	assert.Equal(t, []string{"vip", "default", "svip"}, groups)
}

func TestGetRequestAutoGroupsFiltersBeforeApplyingCurrentLimit(t *testing.T) {
	configureRequestAutoGroupsTest(t)
	ctx := newRequestAutoGroupsContext()
	common.SetContextKey(ctx, constant.ContextKeyTokenAutoGroups, []string{"revoked", "vip", "default", "svip"})
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`[]`))

	groups := GetRequestAutoGroups(ctx, "default")

	assert.Equal(t, []string{"vip", "default"}, groups)
	require.NoError(t, setting.UpdateMaxTokenAutoGroups("1"))
	assert.Equal(t, []string{"vip"}, GetRequestAutoGroups(ctx, "default"))
}

func TestGetRequestAutoGroupsDoesNotFallBackAfterPermissionChange(t *testing.T) {
	configureRequestAutoGroupsTest(t)
	ctx := newRequestAutoGroupsContext()
	common.SetContextKey(ctx, constant.ContextKeyTokenAutoGroups, []string{"vip"})
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default"}`))

	groups := GetRequestAutoGroups(ctx, "default")

	assert.Empty(t, groups)
}

func TestSubscriptionGroupsAddOnlyListedGroups(t *testing.T) {
	configureRequestAutoGroupsTest(t)
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default"}`))
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.UserSubscription{}))
	model.DB = db
	t.Cleanup(func() {
		model.DB = previousDB
		_ = sqlDB.Close()
	})
	end := common.GetTimestamp() + 3600
	require.NoError(t, db.Create(&[]model.UserSubscription{
		{UserId: 1, Status: "active", EndTime: end},
		{UserId: 1, Status: "active", EndTime: end, SupportedGroups: model.SubscriptionGroupList{"svip", "retired"}},
		{UserId: 1, Status: "expired", EndTime: end, SupportedGroups: model.SubscriptionGroupList{"vip"}},
		{UserId: 2, Status: "active", EndTime: end},
	}).Error)

	// An active subscription without supported groups adds none, and does not
	// hide the groups another active subscription lists.
	assert.ElementsMatch(t, []string{"default", "svip"}, slices.Collect(maps.Keys(GetUserUsableGroupsForUser(1, "default"))))
	assert.Equal(t, []string{"default", "svip"}, GetUserAutoGroupForUser(1, "default"))
	assert.ElementsMatch(t, []string{"default"}, slices.Collect(maps.Keys(GetUserUsableGroupsForUser(2, "default"))))
	assert.Equal(t, []string{"default"}, GetUserAutoGroupForUser(2, "default"))
}
