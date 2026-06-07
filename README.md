# Cursor REST Client Plus

<p align="center">
  <img src="images/rest_icon2.png" alt="Cursor REST Client Plus" width="128">
</p>

<p align="center">
  <strong>REST API client for Cursor & VS Code — with Faker, History & Compare built in</strong>
</p>

<p align="center">
  <a href="https://github.com/kit1211/cursor-rest-client-plus"><img src="https://img.shields.io/github/stars/kit1211/cursor-rest-client-plus?style=social" alt="GitHub stars"></a>
  <a href="https://open-vsx.org/extension/kit1211/rest-client-plus"><img src="https://img.shields.io/open-vsx/v/kit1211/rest-client-plus?label=Open%20VSX" alt="Open VSX"></a>
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License">
</p>

A fork of [REST Client](https://github.com/Huachao/vscode-restclient) (MIT), tuned for **Cursor** with features for real-world API testing workflows.

**Repository:** https://github.com/kit1211/cursor-rest-client-plus

---

## Why this extension?

| Problem on Cursor | Cursor REST Client Plus |
|-------------------|-------------------------|
| Response tab never appears | Fixed `previewColumn` handling for Cursor layouts |
| Every request opens a new tab | **Single Response tab** reused and updated |
| Manual test data setup | `{{$faker ...}}` generates data instantly |
| Need to compare past responses | **History + Compare** in the Response tab |

---

## Installation

### Cursor / VS Code

1. Extensions → search `kit1211.rest-client-plus` or **Cursor REST Client Plus**
2. If not found → [Open VSX](https://open-vsx.org/extension/kit1211/rest-client-plus) or install from `.vsix` on [GitHub Releases](https://github.com/kit1211/cursor-rest-client-plus/releases)

```bash
cursor --install-extension rest-client-plus-0.1.8.vsix
```

---

## Quick start (30 seconds)

1. Create `api.http`
2. Write a request and click **Send Request** (or `Cmd+Alt+R` / `Ctrl+Alt+R`)
3. View the result in the **Response** tab beside your editor

```http
GET https://dummyjson.com/products/1 HTTP/1.1
```

**Expected result:** A `Response(XXXms)` tab showing `200 OK`, headers, and JSON body.

---

## Features

### 1. Faker variables — `{{$faker ...}}`

Generate random data in body, headers, or query strings. From [`tests/faker.http`](tests/faker.http):

```http
### All Faker types (POST JSON)
# @name faker-all-types
POST https://webhook.site/your-token HTTP/1.1
Content-Type: application/json

{
  "person": {
    "fullName": "{{$faker fullName}}",
    "firstName": "{{$faker firstName}}",
    "lastName": "{{$faker lastName}}",
    "email": "{{$faker email}}",
    "phone": "{{$faker phone}}"
  },
  "location": {
    "city": "{{$faker city}}",
    "country": "{{$faker country}}"
  },
  "company": "{{$faker company}}",
  "ids": {
    "uuid": "{{$faker uuid}}",
    "ipv4": "{{$faker ipv4}}"
  },
  "time": {
    "datetime": "{{$faker datetime}}",
    "date": "{{$faker date}}"
  },
  "misc": {
    "word": "{{$faker word}}",
    "url": "{{$faker url}}",
    "password": "{{$faker password}}",
    "boolean": {{$faker boolean}},
    "age": {{$faker int 18 60}},
    "score": {{$faker int 1 100}}
  }
}
```

**Resolved body** (values change on every send):

```json
{
  "person": {
    "fullName": "Fred Simonis",
    "firstName": "Braxton",
    "lastName": "Christiansen",
    "email": "Kurtis.Weimann@gmail.com",
    "phone": "504-590-2644 x4357"
  },
  "location": {
    "city": "Feeneyhaven",
    "country": "Saint Kitts and Nevis"
  },
  "company": "Ryan, Pfeffer and Sawayn",
  "ids": {
    "uuid": "21a3f4b7-a5dd-4acc-b4c0-3e37dc567a2d",
    "ipv4": "157.181.13.128"
  },
  "time": {
    "datetime": "2026-06-07T13:05:42.093Z",
    "date": "2026-06-06"
  },
  "misc": {
    "word": "facere",
    "url": "https://curly-lox.com",
    "password": "lgR6nuTj5OkucBF",
    "boolean": true,
    "age": 36,
    "score": 50
  }
}
```

| Type | Output |
|------|--------|
| `fullName`, `firstName`, `lastName` | Names |
| `email`, `phone` | Contact info |
| `uuid`, `ipv4` | IDs / IPs |
| `datetime`, `date` | Dates & times |
| `city`, `country`, `company` | Location / company |
| `word`, `url`, `password` | Misc |
| `boolean` | `true` / `false` |
| `int min max` | Integer in range |

> Each `{{$faker ...}}` in the same request gets a **unique** value.

---

### 2. Response History — automatic on every request

No configuration required. Every response is saved to:

```
~/.rest-client/response-cache/        ← full response files (headers + body)
~/.rest-client/response-history.json  ← index of recent entries
```

Response tab toolbar:

```
History (N) [dropdown ▼]  |  vs Previous  |  Compare with… [dropdown ▼]
```

- **History dropdown** — browse past responses for the entire `.http` file (all named requests)
- Focus the dropdown → list refreshes from disk automatically
- Select an entry → view it in the same tab → click **← Back** to return to current

**Expected result:** After 3 requests → `History (3)` lists entries like `[faker-all-types] 200 · 282ms · 6/8/2026...`

---

### 3. Auto-save beside your file — `@save = true`

To also keep `.json` copies in your project (in addition to the global cache):

```http
@save = true

### Create user
# @name create-user
POST https://api.example.com/users HTTP/1.1
...
```

Files are written to:

```
your-api.http
.rest-client-responses/your-api/
  post_users_2026-06-08T....json
```

Each file contains `_meta`, `headers`, and `body`.

---

### 4. Compare — native Cursor/VS Code diff

- **vs Previous** — compare current response with the previous run of the **same request** (requires ≥ 2 runs)
- **Compare with…** — pick any past response from the dropdown → opens the **IDE diff editor** beside the Response tab
- Close the diff tab when done — **Response tab stays open**, no need to resend

**Expected result:** Side-by-side diff with green/red highlighting, same as the built-in Compare view.

---

### 5. Single Response tab

Resending or switching requests in the same file updates the existing `Response(XXXms)` tab instead of opening new ones.

---

## Sample test file

See [`tests/faker.http`](tests/faker.http) for full Faker coverage + webhook tests.

Run the integration test:

```bash
npm run webpack
node scripts/test-faker-http.mjs
```

---

## Other variables (from REST Client)

| Variable | Description |
|----------|-------------|
| `{{$guid}}` | UUID |
| `{{$timestamp}}` | Unix timestamp |
| `{{$datetime iso8601}}` | ISO8601 datetime |
| `{{$randomInt 1 100}}` | Random integer |
| `{{$dotenv VAR}}` | Read from `.env` |
| `@variable = value` | File-level variable |
| `# @name my-request` | Name a request (used in History) |

---

## Recommended settings

```json
{
  "rest-client.previewColumn": "beside",
  "rest-client.previewResponsePanelTakeFocus": true,
  "rest-client.requestNameAsResponseTabTitle": true
}
```

| Setting | Effect |
|---------|--------|
| `previewColumn: "beside"` | Open Response next to the `.http` file |
| `requestNameAsResponseTabTitle: true` | Tab title `my-request(282ms)` instead of `Response(282ms)` |

---

## Keyboard shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Send Request | `Cmd+Alt+R` | `Ctrl+Alt+R` |
| Rerun Last Request | Command Palette → `Rest Client: Rerun Request` | Same |

---

## Development / Build

```bash
npm install
npm run webpack            # development build
npm run vscode:prepublish  # production build
npx @vscode/vsce package --allow-missing-repository
```

Test in Cursor: **F5** → Extension Development Host

---

## Changelog (summary)

| Version | Highlights |
|---------|------------|
| **0.1.8** | English UI for History/Compare, English README |
| **0.1.7** | Per-file history, IDE diff compare, auto cache |
| **0.1.6** | History/Compare toolbar in Response tab |
| **0.1.5** | `@save = true`, `response-history.json` |
| **0.1.4** | Reuse Response tab, Cursor preview fix |
| **0.1.0** | Faker variables, rebrand |

Full details → [CHANGELOG.md](CHANGELOG.md)

---

## Credits

- [REST Client](https://github.com/Huachao/vscode-restclient) — Huachao Mao (MIT)
- [@faker-js/faker](https://fakerjs.dev/) — random test data

## License

MIT — see [LICENSE](LICENSE)
