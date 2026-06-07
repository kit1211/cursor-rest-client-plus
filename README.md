# Cursor REST Client Plus

<p align="center">
  <img src="images/rest_icon2.png" alt="Cursor REST Client Plus" width="128">
</p>

<p align="center">
  <strong>ยิง REST API ใน Cursor/VS Code — พร้อม Faker, History และ Compare ในตัว</strong>
</p>

<p align="center">
  <a href="https://github.com/kit1211/cursor-rest-client-plus"><img src="https://img.shields.io/github/stars/kit1211/cursor-rest-client-plus?style=social" alt="GitHub stars"></a>
  <a href="https://open-vsx.org/extension/kit1211/rest-client-plus"><img src="https://img.shields.io/open-vsx/v/kit1211/rest-client-plus?label=Open%20VSX" alt="Open VSX"></a>
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License">
</p>

Fork จาก [REST Client](https://github.com/Huachao/vscode-restclient) (MIT) ปรับให้ทำงานบน **Cursor** ได้เต็มที่ และเพิ่มฟีเจอร์สำหรับ workflow ทดสอบ API จริง

**Repository:** https://github.com/kit1211/cursor-rest-client-plus

---

## ทำไมต้องใช้ตัวนี้?

| ปัญหาบน Cursor | Cursor REST Client Plus |
|----------------|-------------------------|
| Response ไม่ขึ้นหลังยิง request | แก้ `previewColumn` ให้เปิด tab ถูกต้อง |
| ยิงซ้ำแล้วเปิด tab ใหม่ทุกครั้ง | ใช้ **Response tab เดียว** อัปเดตแทน |
| ต้องเตรียมข้อมูลทดสอบเอง | ใส่ `{{$faker ...}}` สุ่มได้ทันที |
| อยากเก็บ response เก่าเทียบกัน | **History + Compare** ใน Response tab |

---

## ติดตั้ง

### Cursor / VS Code

1. Extensions → ค้นหา `kit1211.rest-client-plus` หรือ **Cursor REST Client Plus**
2. ถ้าค้นหาไม่เจอ → [Open VSX](https://open-vsx.org/extension/kit1211/rest-client-plus) หรือติดตั้งจาก `.vsix` ใน [GitHub Releases](https://github.com/kit1211/cursor-rest-client-plus/releases)

```bash
cursor --install-extension rest-client-plus-0.1.7.vsix
```

---

## เริ่มใช้ใน 30 วินาที

1. สร้างไฟล์ `api.http`
2. เขียน request แล้วคลิก **Send Request** (หรือ `Cmd+Alt+R` / `Ctrl+Alt+R`)
3. ดูผลในแท็บ **Response** ด้านข้าง

```http
GET https://dummyjson.com/products/1 HTTP/1.1
```

**ผลลัพธ์ที่คาดหวัง:** แท็บ `Response(XXXms)` แสดง status `200 OK`, headers และ JSON body

---

## ฟีเจอร์ใหม่

### 1. ตัวแปร Faker — `{{$faker ...}}`

สุ่มข้อมูลใน body, header หรือ query string ได้ทันที

```http
POST https://api.example.com/users HTTP/1.1
Content-Type: application/json

{
  "name": "{{$faker fullName}}",
  "email": "{{$faker email}}",
  "age": {{$faker int 18 60}}
}
```

| Type | ผลลัพธ์ |
|------|---------|
| `fullName`, `firstName`, `lastName` | ชื่อ |
| `email`, `phone` | ติดต่อ |
| `uuid`, `ipv4` | ID / IP |
| `datetime`, `date` | วันเวลา |
| `city`, `country`, `company` | ที่อยู่ / บริษัท |
| `word`, `url`, `password` | อื่นๆ |
| `boolean` | `true` / `false` |
| `int min max` | ตัวเลขในช่วง |

> แต่ละ `{{$faker ...}}` ใน request เดียวกันสุ่มคนละค่า — ไม่ซ้ำกันใน request เดียว

---

### 2. Response History — เก็บทุกครั้งอัตโนมัติ

**ไม่ต้องตั้งค่าอะไร** — ทุก response ถูกบันทึกลง:

```
~/.rest-client/response-cache/     ← ไฟล์ response เต็ม (headers + body)
~/.rest-client/response-history.json  ← index รายการล่าสุด
```

ในแท็บ Response จะมี toolbar:

```
History (N) [dropdown ▼]  |  เทียบครั้งก่อน  |  เทียบกับ… [dropdown ▼]
```

- **History dropdown** — ดู response เก่าทั้งหมดในไฟล์ `.http` นั้น (ข้าม request ก็ยังเห็น)
- คลิก dropdown → โหลดรายการล่าสุดจาก disk อัตโนมัติ
- เลือกรายการ → ดู response เก่าใน tab เดียวกัน → กด **← กลับ** กลับมาปัจจุบัน

**ผลลัพธ์ที่คาดหวัง:** ยิง 3 ครั้ง → `History (3)` แสดงรายการพร้อมชื่อ request เช่น `[faker-all-types] 200 · 282ms · 6/8/2026...`

---

### 3. Auto-save ข้างไฟล์ — `@save = true`

ถ้าต้องการ copy ไฟล์ `.json` ไว้ในโปรเจกต์ (นอกจาก cache ใน home):

```http
@save = true

### สร้างผู้ใช้
# @name create-user
POST https://api.example.com/users HTTP/1.1
...
```

ไฟล์จะถูก save ที่:

```
your-api.http
.rest-client-responses/your-api/
  post_users_2026-06-08T....json
```

แต่ละไฟล์มี `_meta`, `headers`, `body` ครบ

---

### 4. Compare — diff แบบ Cursor IDE

- **เทียบครั้งก่อน** — เทียบ response ปัจจุบันกับครั้งก่อนของ **request เดียวกัน** (ต้องยิงซ้ำ ≥ 2 ครั้ง)
- **เทียบกับ…** — เลือกจาก dropdown แล้วเปิด **diff editor ของ Cursor** ข้างๆ Response tab
- ปิด diff tab เมื่อเสร็จ — **Response tab ยังอยู่** ไม่ต้องยิงใหม่

**ผลลัพธ์ที่คาดหวัง:** เปิด split diff สีเขียว/แดง แบบเดียวกับ Compare ใน IDE

---

### 5. Response tab เดียว (ไม่เปิดซ้ำ)

ยิง request ซ้ำหรือเปลี่ยน request ในไฟล์เดียวกัน → อัปเดตแท็บ `Response(XXXms)` เดิม ไม่สร้าง tab ใหม่ทุกครั้ง

---

## ตัวอย่างไฟล์ทดสอบ

ดู [`tests/faker.http`](tests/faker.http) — ทดสอบ Faker ครบทุก type + webhook

รัน integration test จากเทอร์มินัล:

```bash
npm run webpack
node scripts/test-faker-http.mjs
```

---

## ตัวแปรอื่นๆ (จาก REST Client เดิม)

| ตัวแปร | คำอธิบาย |
|--------|----------|
| `{{$guid}}` | UUID |
| `{{$timestamp}}` | Unix timestamp |
| `{{$datetime iso8601}}` | วันเวลา ISO8601 |
| `{{$randomInt 1 100}}` | ตัวเลขสุ่ม |
| `{{$dotenv VAR}}` | อ่านจาก `.env` |
| `@variable = value` | ตัวแปรในไฟล์ |
| `# @name my-request` | ตั้งชื่อ request (ใช้ใน History) |

---

## การตั้งค่าแนะนำ

```json
{
  "rest-client.previewColumn": "beside",
  "rest-client.previewResponsePanelTakeFocus": true,
  "rest-client.requestNameAsResponseTabTitle": true
}
```

| ค่า | ความหมาย |
|-----|----------|
| `previewColumn: "beside"` | เปิด Response ข้างไฟล์ `.http` |
| `requestNameAsResponseTabTitle: true` | ชื่อ tab เป็น `ชื่อ-request(282ms)` แทน `Response(282ms)` |

---

## Keyboard Shortcuts

| การกระทำ | macOS | Windows/Linux |
|----------|-------|---------------|
| Send Request | `Cmd+Alt+R` | `Ctrl+Alt+R` |
| Rerun Last Request | Command Palette → `Rest Client: Rerun Request` | เหมือนกัน |

---

## พัฒนา / Build

```bash
npm install
npm run webpack          # build development
npm run vscode:prepublish  # build production
npx @vscode/vsce package --allow-missing-repository
```

ทดสอบใน Cursor: **F5** → Extension Development Host

---

## Changelog สรุป

| เวอร์ชัน | สิ่งที่เพิ่ม |
|---------|-------------|
| **0.1.7** | History ทั้งไฟล์, Compare แบบ IDE diff, cache อัตโนมัติ |
| **0.1.6** | Toolbar History/Compare ใน Response tab |
| **0.1.5** | `@save = true`, response-history.json |
| **0.1.4** | Reuse Response tab, แก้ preview บน Cursor |
| **0.1.0** | Faker variables, rebrand |

รายละเอียดเต็ม → [CHANGELOG.md](CHANGELOG.md)

---

## เครดิต

- [REST Client](https://github.com/Huachao/vscode-restclient) — Huachao Mao (MIT)
- [@faker-js/faker](https://fakerjs.dev/) — ข้อมูลสุ่ม

## License

MIT — ดู [LICENSE](LICENSE)
