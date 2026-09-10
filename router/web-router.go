package router

import (
	"embed"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

// ThemeAssets holds the embedded frontend assets for both themes.
type ThemeAssets struct {
	DefaultBuildFS   embed.FS
	DefaultIndexPage []byte
	ClassicBuildFS   embed.FS
	ClassicIndexPage []byte
	// IndexPage keeps the pre-theme test and embedding API source-compatible.
	IndexPage []byte
}

// WebAssets is retained for callers that used the single-theme embedding API.
// New callers should use ThemeAssets so both frontend themes can be served.
type WebAssets = ThemeAssets

func embeddedThemeFS(fs embed.FS, targetPath string) static.ServeFileSystem {
	if _, err := fs.ReadDir(targetPath); err != nil {
		return nil
	}
	return common.EmbedFolder(fs, targetPath)
}

func SetWebRouter(router *gin.Engine, assets ThemeAssets, pluginDispatcher gin.HandlerFunc) {
	defaultFS := embeddedThemeFS(assets.DefaultBuildFS, "web/default/dist")
	classicFS := embeddedThemeFS(assets.ClassicBuildFS, "web/classic/dist")
	var themeFS static.ServeFileSystem
	if defaultFS != nil && classicFS != nil {
		themeFS = common.NewThemeAwareFS(defaultFS, classicFS)
	} else if defaultFS != nil {
		themeFS = defaultFS
	} else {
		themeFS = classicFS
	}
	defaultIndexPage := assets.DefaultIndexPage
	if len(defaultIndexPage) == 0 {
		defaultIndexPage = assets.IndexPage
	}
	classicIndexPage := assets.ClassicIndexPage
	if len(classicIndexPage) == 0 {
		classicIndexPage = assets.IndexPage
	}

	handlers := []gin.HandlerFunc{
		pluginDispatcher,
		middleware.RouteTag("web"),
		gzip.Gzip(gzip.DefaultCompression),
		middleware.AccessTokenAudit(),
		middleware.GlobalWebRateLimit(),
		middleware.Cache(),
	}
	if themeFS != nil {
		handlers = append(handlers, static.Serve("/", themeFS))
	}
	handlers = append(handlers, func(c *gin.Context) {
		if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") || strings.HasPrefix(c.Request.RequestURI, "/assets") {
			controller.RelayNotFound(c)
			return
		}
		c.Header("Cache-Control", "no-cache")
		if common.GetTheme() == "classic" {
			c.Data(http.StatusOK, "text/html; charset=utf-8", classicIndexPage)
		} else {
			c.Data(http.StatusOK, "text/html; charset=utf-8", defaultIndexPage)
		}
	})
	router.NoRoute(handlers...)
}
