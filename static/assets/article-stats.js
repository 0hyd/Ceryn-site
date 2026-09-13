const VIEW_DEDUPLICATION_MS = 30 * 60 * 1000

function statsElement() {
  return document.querySelector(".article-stats[data-stats-endpoint][data-article-id]")
}

function endpoint(path) {
  const base = statsElement()?.dataset.statsEndpoint
  if (!base) return null
  return new URL(path, base.endsWith("/") ? base : `${base}/`)
}

function articleId() {
  return statsElement()?.dataset.articleId || null
}

function storageKey(kind, id, base) {
  return `blog-analytics:${kind}:${base.origin}:${id}`
}

function readStorage(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function shouldReportView(id, base, isExternal) {
  const key = storageKey(`view:${isExternal ? "external" : "direct"}`, id, base)
  const lastReportedAt = Number(readStorage(key))
  if (Number.isFinite(lastReportedAt) && Date.now() - lastReportedAt < VIEW_DEDUPLICATION_MS) {
    return false
  }

  // Mark first so refreshes and duplicate module loads cannot issue parallel reports.
  writeStorage(key, String(Date.now()))
  return true
}

function report(route) {
  const id = articleId()
  const url = endpoint(route)
  if (!id || !url) return

  url.searchParams.set("id", id)
  const isExternal = new URLSearchParams(location.search).get("from") === "external"
  if (route === "view" && !shouldReportView(id, url, isExternal)) return
  if (route === "view" && isExternal) {
    url.searchParams.set("external", "1")
  }

  // sendBeacon uses POST; the Worker accepts it for views to avoid losing visits on unload.
  if (route === "view" && navigator.sendBeacon?.(url.href)) return
  fetch(url.href, { method: "GET", keepalive: true }).catch(() => {})
}

function updateLikeButton(likeButton, liked) {
  likeButton.ariaPressed = String(liked)
  likeButton.ariaLabel = liked ? "已点赞" : "点赞"
  likeButton.textContent = liked ? "已赞" : "赞"
  likeButton.disabled = liked

  const prompt = statsElement()?.querySelector(".article-like-prompt")
  if (prompt) {
    prompt.textContent = liked ? "感谢你的支持" : "如果觉得文章不错，点个赞吧"
  }
}

function reportLike() {
  const id = articleId()
  const url = endpoint("like")
  if (!id || !url) return false

  const key = storageKey("like", id, url)
  if (readStorage(key)) return false

  writeStorage(key, "1")
  report("like")
  return true
}

function initializeArticleStats() {
  const likeButton = statsElement()?.querySelector(".article-like-button")
  const id = articleId()
  const base = endpoint("like")
  if (!likeButton || !id || !base) return

  const likeKey = storageKey("like", id, base)
  updateLikeButton(likeButton, Boolean(readStorage(likeKey)))
  report("view")
  if (likeButton.dataset.statsBound === "true") return

  likeButton.dataset.statsBound = "true"
  likeButton.addEventListener("click", () => {
    if (reportLike()) updateLikeButton(likeButton, true)
  })
}

document.addEventListener("nav", initializeArticleStats)
initializeArticleStats()
