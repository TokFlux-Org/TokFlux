package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestUserInsertGeneratesLongUniqueAffCode(t *testing.T) {
	truncateTables(t)
	user := &User{
		Username: "aff_code_user",
		Password: "password123",
		Status:   common.UserStatusEnabled,
	}

	require.NoError(t, user.Insert(0))
	require.Len(t, user.AffCode, affCodeLength)

	id, err := GetUserIdByAffCode(user.AffCode)
	require.NoError(t, err)
	require.Equal(t, user.Id, id)
}
