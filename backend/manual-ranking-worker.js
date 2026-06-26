const DEFAULT_OWNER = 'Acblade'
const DEFAULT_REPO = 'pokemon-champion-cn'
const DEFAULT_BRANCH = 'main'

function jsonResponse(body, status = 200, origin = '*') {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function corsOrigin(request, env) {
  const allowedOrigin = env.ALLOWED_ORIGIN || 'https://acblade.github.io'
  const origin = request.headers.get('Origin') || ''
  return origin === allowedOrigin ? origin : allowedOrigin
}

function parseJstTimestamp(value) {
  const match = String(value || '').trim().match(/(?:日本时间\s*)?(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})/)
  if (!match) throw new Error('时间格式应类似 2026/6/25 23:46')
  const [, year, month, day, hour, minute] = match
  const utcMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 9, Number(minute), 0)
  return new Date(utcMs).toISOString()
}

function parseRankingName(rawValue) {
  const lines = String(rawValue || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const firstLine = lines[0] || String(rawValue || '').trim()
  const tokens = firstLine.split(/\s+/).filter(Boolean)
  if (tokens.length >= 2 && tokens.length % 2 === 0) {
    const middle = tokens.length / 2
    const left = tokens.slice(0, middle).join(' ')
    const right = tokens.slice(middle).join(' ')
    if (left === right) return left
  }
  return tokens[0] || firstLine
}

function parseRankingsByRecordPattern(text) {
  const normalizedText = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/^日本時間.*$/gm, '\n')
    .replace(/^日本时间.*$/gm, '\n')
    .replace(/--+/g, '\n')
  const rankings = []
  const recordPattern = /(?:^|\s)(\d{1,3})\s+(\d+(?:\.\d+)?)\s+([\s\S]*?)(?=\s+\d{1,3}\s+\d+(?:\.\d+)?\s+|$)/g
  for (const match of normalizedText.matchAll(recordPattern)) {
    const rank = Number(match[1])
    const rating = Number(match[2])
    const name = parseRankingName(match[3])
    if (rank >= 1 && rank <= 300 && Number.isFinite(rating) && name) {
      rankings.push({ rank, rating, name })
    }
  }
  return rankings
}

function parseRankings(text) {
  const patternRankings = parseRankingsByRecordPattern(text)
  if (patternRankings.length >= 300) return patternRankings.slice(0, 300).sort((a, b) => a.rank - b.rank)

  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== '--' && !line.startsWith('日本时间'))

  const rankings = []
  for (let index = 0; index < lines.length;) {
    const rank = Number(lines[index])
    const rating = Number(lines[index + 1])
    const name = lines[index + 2]
    if (Number.isInteger(rank) && Number.isFinite(rating) && name) {
      rankings.push({ rank, rating, name })
      const nextLine = lines[index + 3]
      const nextNextLine = lines[index + 4]
      const nextStartsRecord = Number.isInteger(Number(nextLine)) && Number.isFinite(Number(nextNextLine))
      index += nextStartsRecord ? 3 : 4
      continue
    }
    index += 1
  }
  if (rankings.length !== 300) throw new Error(`需要解析到 300 人，目前解析到 ${rankings.length} 人`)
  return rankings.sort((a, b) => a.rank - b.rank)
}

function decodeBase64Text(value) {
  const binary = atob(value.replace(/\n/g, ''))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function encodeBase64Text(value) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function githubFetch(env, path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'pokemon-champion-cn-manual-ranking-worker',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  })
  const text = await response.text()
  let body = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      const preview = text.slice(0, 200)
      if (!response.ok) {
        throw new Error(`GitHub API 失败: ${response.status} ${response.statusText}: ${preview}`)
      }
      throw new Error(`GitHub API 返回了无法解析的响应: ${preview}`)
    }
  }
  if (!response.ok) {
    const message = body?.message || `${response.status} ${response.statusText}`
    throw new Error(`GitHub API 失败: ${message}`)
  }
  return body
}

async function getFile(owner, repo, branch, path, env) {
  const file = await githubFetch(env, `/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`)
  if (!file?.content) throw new Error(`GitHub 文件响应缺少内容: ${path}`)
  return decodeBase64Text(file.content)
}

async function createBlob(owner, repo, content, env) {
  const blob = await githubFetch(env, `/repos/${owner}/${repo}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({ content: encodeBase64Text(content), encoding: 'base64' }),
  })
  return blob.sha
}

async function commitFiles(owner, repo, branch, files, message, env) {
  const ref = await githubFetch(env, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`)
  const baseCommit = await githubFetch(env, `/repos/${owner}/${repo}/git/commits/${ref.object.sha}`)
  const treeEntries = []
  for (const file of files) {
    treeEntries.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: await createBlob(owner, repo, file.content, env),
    })
  }
  const tree = await githubFetch(env, `/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: treeEntries }),
  })
  const commit = await githubFetch(env, `/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [ref.object.sha] }),
  })
  await githubFetch(env, `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  })
  return commit
}

async function importRankings(payload, env) {
  if (!env.GITHUB_TOKEN) throw new Error('后端缺少 GITHUB_TOKEN')

  const owner = env.GITHUB_OWNER || DEFAULT_OWNER
  const repo = env.GITHUB_REPO || DEFAULT_REPO
  const branch = env.GITHUB_BRANCH || DEFAULT_BRANCH
  const datasetKey = String(payload.datasetKey || '').trim()
  if (!datasetKey) throw new Error('缺少 datasetKey')

  const importedAt = parseJstTimestamp(payload.rankingTimeJst)
  const rankings = parseRankings(payload.rankingsText)
  const usageText = await getFile(owner, repo, branch, 'src/generated/usage-datasets.json', env)
  const collection = JSON.parse(usageText)
  const dataset = collection.datasets?.[datasetKey]
  if (!dataset) throw new Error(`找不到数据集: ${datasetKey}`)

  dataset.trainerSource = 'Battle Database Champions'
  dataset.trainerSourceUrl = `https://champs.pokedb.tokyo/trainer/list?season=${dataset.season}&rule=${dataset.rule}`
  dataset.trainerRankingsUpdatedAt = importedAt
  dataset.trainerRankingsAvailable = true
  dataset.trainerRankingsNote = '玩家排名由后端手动导入数据更新，原始时间按日本时间解析。'
  dataset.trainerRankings = rankings
  collection.updatedAt = new Date().toISOString()

  const files = [{
    path: 'src/generated/usage-datasets.json',
    content: `${JSON.stringify(collection, null, 2)}\n`,
  }]
  if (collection.defaultKey === datasetKey) {
    files.push({
      path: 'src/generated/pikalytics-usage.json',
      content: `${JSON.stringify(collection.datasets[collection.defaultKey], null, 2)}\n`,
    })
  }
  const commit = await commitFiles(owner, repo, branch, files, `chore: import manual trainer rankings ${dataset.season}/${dataset.rule}`, env)
  return { importedAt, count: rankings.length, commitSha: commit.sha, commitUrl: commit.html_url }
}

export default {
  async fetch(request, env) {
    const origin = corsOrigin(request, env)
    if (request.method === 'OPTIONS') return jsonResponse({ ok: true }, 200, origin)
    if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'Only POST is supported' }, 405, origin)

    try {
      let payload
      try {
        payload = await request.json()
      } catch {
        return jsonResponse({ ok: false, error: '请求内容不是有效 JSON' }, 400, origin)
      }
      const result = await importRankings(payload, env)
      return jsonResponse({ ok: true, ...result }, 200, origin)
    } catch (error) {
      return jsonResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400, origin)
    }
  },
}
