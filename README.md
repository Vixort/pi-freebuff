# pi-freebuff

Extension สำหรับเชื่อมต่อ **Freebuff (Codebuff)** เข้ากับ **pi CLI** แบบ **Embedded Native (All-in-One)** โดย **ไม่ต้องใช้ Docker, ไม่ต้องลง Go และไม่มี Background Service ภายนอก**

---

## จุดเด่น (Highlights)

- **Zero-Docker / Zero-Daemon:** ทำงานเป็น in-process adapter ขนาดเบาภายใน pi CLI เปิดและปิดตามรอบการใช้งานของ pi ทันที
- **Auto Auth Token:** ตรวจพบและโหลด `authToken` จาก `~/.config/manicode/credentials.json` ให้อัตโนมัติ (หากเคยล็อกอินผ่าน `freebuff` CLI ไว้แล้ว ไม่ต้องตั้งค่าอะไรเลย)
- **Auto Model Discovery:** ดึงรายชื่อโมเดลฟรีที่โควต้าของคุณใช้งานได้แบบสดๆ เช่น `deepseek/deepseek-v4-flash`, `mimo/mimo-v2.5`, `upstage/solar-pro4`, `minimax/minimax-m3`
- **Dynamic Session & Model Switching:** จัดการคิว Waiting Room และสลับโมเดลให้อัตโนมัติเบื้องหลัง
- **คำสั่ง `/freebuff` ใน TUI:** เรียกดูสถานะ, เช็คโควต้าประจำวัน (Quota used/limit), และดูรายการโมเดลได้ตลอดเวลา

---

## การอัปเดต (Updater Script)

ในโปรเจกต์นี้มีสคริปต์ `update.sh` สำหรับดึงโค้ดเวอร์ชันล่าสุดและอัปเดต Token ได้อย่างสะดวก:

```bash
# 1. ดึงอัปเดตโค้ดล่าสุดจาก Git และตรวจสอบระบบ
./update.sh

# 2. ใส่หรือเปลี่ยน Auth Token ใหม่ได้ในคำสั่งเดียว:
./update.sh <TOKEN_ใหม่_ของคุณ>
```

---

## วิธีติดตั้งและใช้งาน

### 1. ติดตั้ง Extension เข้า pi CLI

เลือกวิธีใดวิธีหนึ่ง:

**ติดตั้งจากโฟลเดอร์นี้ในเครื่อง:**
```bash
pi install /home/null/Projects/freebufftopi
```

**หรือติดตั้งผ่าน Git (สำหรับแชร์ให้ผู้อื่น):**
```bash
pi install git:github.com/<username>/pi-freebuff
```

**หรือทดลองรันชั่วคราว:**
```bash
pi -e ./index.ts
```

---

### 2. เตรียม Auth Token (ทำเพียงครั้งแรก)

หากคุณเคยติดตั้งและล็อกอิน `freebuff` CLI ไว้แล้ว ตัว extension จะดึง token มาใช้ให้อัตโนมัติโดยที่คุณไม่ต้องทำอะไรเลย

หากยังไม่เคยมี token ให้เลือกทำวิธีใดวิธีหนึ่ง:
- **วิธีที่ 1 (ผ่าน CLI):**
  ```bash
  npm i -g freebuff
  freebuff # ล็อกอินครั้งแรก token จะถูกบันทึกลง ~/.config/manicode/credentials.json
  ```
- **วิธีที่ 2 (ผ่าน Environment Variable):**
  รับ token จาก [freebuff.llm.pm](https://freebuff.llm.pm) แล้วตั้งค่า:
  ```bash
  export FREEBUFF_AUTH_TOKEN="<token_ของคุณ>"
  ```

---

### 3. เรียกใช้งานใน pi CLI

- **ดูรายการโมเดลที่ใช้งานได้:**
  ```bash
  pi --list-models | grep freebuff
  ```

- **เริ่มสนทนาผ่านโมเดลของ Freebuff:**
  ```bash
  pi --model freebuff/deepseek/deepseek-v4-flash
  ```
  หรือ:
  ```bash
  pi --model freebuff/mimo/mimo-v2.5
  ```

- **ในหน้าต่าง Interactive TUI:**
  - พิมพ์ `/model` เพื่อเลือกโมเดลใต้กลุ่ม **Freebuff (Native)**
  - พิมพ์ `/freebuff` เพื่อดูสถานะเซิร์ฟเวอร์, ดูโควต้าการใช้งาน และคำแนะนำการสลับโมเดล

---

## License

MIT
