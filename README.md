# Cursor REST Client Plus

![Cursor REST Client Plus](images/rest_icon2.png)

[![GitHub](https://img.shields.io/github/stars/kit1211/cursor-rest-client-plus?style=social)](https://github.com/kit1211/cursor-rest-client-plus)
[![Open VSX](https://img.shields.io/open-vsx/v/kit1211/rest-client-plus)](https://open-vsx.org/extension/kit1211/rest-client-plus)

**Repository:** https://github.com/kit1211/cursor-rest-client-plus

Extension สำหรับทดสอบ REST API ใน Cursor และ VS Code โดยเขียนคำขอ HTTP ในไฟล์ `.http` หรือ `.rest` แล้วกด **Send Request**

Fork จาก [REST Client](https://github.com/Huachao/vscode-restclient) โดย Huachao Mao (MIT License) พร้อมฟีเจอร์เพิ่มเติมสำหรับ Cursor

## ฟีเจอร์ที่เพิ่มในเวอร์ชันนี้

### แก้ปัญหา Response ไม่แสดงบน Cursor

แก้บั๊กที่ request ยิงออกได้แต่แท็บ response ไม่ขึ้น เมื่อ `viewColumn` เป็น `undefined` (พบบ่อยเมื่อเปิด Chat/Agent panel ใน Cursor)

### ตัวแปร Faker (`{{$faker ...}}`)

สุ่มข้อมูลใน request ได้ทันที โดยไม่ต้องเตรียมข้อมูลเอง

รูปแบบ:

```
{{$faker <type>}}
{{$faker int <min> <max>}}
```

| Type | ตัวอย่างผลลัพธ์ |
|------|----------------|
| `fullName` | ชื่อ-นามสกุล |
| `firstName` | ชื่อ |
| `lastName` | นามสกุล |
| `email` | อีเมล |
| `phone` | เบอร์โทร |
| `uuid` | UUID |
| `datetime` | วันเวลา ISO (ล่าสุด) |
| `date` | วันที่ YYYY-MM-DD |
| `city` | เมือง |
| `country` | ประเทศ |
| `company` | ชื่อบริษัท |
| `word` | คำสุ่ม |
| `url` | URL |
| `ipv4` | IP v4 |
| `password` | รหัสผ่านสุ่ม |
| `boolean` | true / false |
| `int` | ตัวเลขสุ่ม (default 0–10000 หรือระบุ min max) |

ตัวอย่าง:

```http
### สร้างผู้ใช้ทดสอบ
POST https://api.example.com/users HTTP/1.1
Content-Type: application/json

{
  "name": "{{$faker fullName}}",
  "email": "{{$faker email}}",
  "phone": "{{$faker phone}}",
  "age": {{$faker int 18 60}},
  "registered_at": "{{$faker datetime}}"
}
```

## วิธีใช้งานพื้นฐาน

1. สร้างไฟล์ `api.http`
2. เขียนคำขอ HTTP เช่น `GET https://httpbin.org/get`
3. คลิก **Send Request** เหนือคำขอ หรือกด `Ctrl+Alt+R` (Mac: `Cmd+Alt+R`)
4. ดู response ในแท็บด้านข้าง

### หลาย request ในไฟล์เดียว

คั่นด้วย `###`:

```http
GET https://httpbin.org/get

###

POST https://httpbin.org/post HTTP/1.1
Content-Type: application/json

{
  "hello": "world"
}
```

## ตัวแปรระบบอื่นๆ (จาก REST Client เดิม)

| ตัวแปร | คำอธิบาย |
|--------|----------|
| `{{$guid}}` | UUID |
| `{{$timestamp}}` | Unix timestamp |
| `{{$datetime iso8601}}` | วันเวลา ISO8601 |
| `{{$randomInt 1 100}}` | ตัวเลขสุ่ม |
| `{{$dotenv VAR}}` | อ่านจากไฟล์ `.env` |
| `@variable = value` | ตัวแปรในไฟล์ |

## การตั้งค่าที่แนะนำ

```json
{
  "rest-client.previewColumn": "beside",
  "rest-client.previewResponsePanelTakeFocus": true
}
```

## ติดตั้ง

ค้นหา **Cursor REST Client Plus** ใน Extensions ของ Cursor หรือติดตั้งจาก [Open VSX](https://open-vsx.org/extension/kit1211/rest-client-plus)

## เครดิต

- [REST Client](https://github.com/Huachao/vscode-restclient) โดย Huachao Mao — MIT License
- [Faker.js](https://fakerjs.dev/) สำหรับข้อมูลสุ่ม

## License

MIT — ดูรายละเอียดใน [LICENSE](LICENSE)
