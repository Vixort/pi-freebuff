# Plan: Freebuff Hourly Session Persistence & Credit Preservation Architecture

## Context
ระบบ Freebuff (Codebuff) เวอร์ชันใหม่เปลี่ยนรูปแบบการคิดค่าบริการมาเป็น **ระบบเหรียญ Freebucks (Hourly Rental Economy)**:
- ทุกบัญชีฟรีได้รับโควต้า **25 Freebucks ต่อวัน** (รีเซ็ตทุกวันตอนเที่ยงคืนเวลาแปซิฟิก หรือ 14:00 น. เวลาไทย)
- การเริ่มใช้งานโมเดลคิดค่าเช่าเป็น **รายชั่วโมง (Per-Hour Session)** เช่น `z-ai/glm-5.3-flash` (5 เหรียญ/ชม.), `mimo/mimo-v2.5` (10 เหรียญ/ชม.), `deepseek/deepseek-v4-flash` (25–40 เหรียญ/ชม.)
- เมื่อจ่ายเหรียญเปิด Session โมเดลใดแล้ว จะสามารถใช้งานโมเดลนั้นได้แบบ **ไม่จำกัดจำนวนคำถามตลอด 60 นาทีเต็ม**
- ปัญหาในระบบเดิมคือ มีการบังคับหมุน Token ทุกๆ 25 คำขอ และมีการส่งคำสั่ง `DELETE /session` เมื่อปิด pi CLI ทำให้ Session ที่เช่าไว้ 1 ชั่วโมงถูกทำลายทิ้งก่อนเวลา ส่งผลให้ผู้ใช้เสียเหรียญซ้ำซ้อนโดยไม่จำเป็น

เป้าหมายคือการออกแบบระบบ **Session Persistence & Credit Optimization** เพื่อให้ผู้ใช้ได้รับความคุ้มค่าสูงสุดจากเหรียญที่จ่ายไป

---

## Approach

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    HOURLY SESSION & COIN PRESERVATION                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [User Prompts pi] ──► Check Local Disk Cache (~/.config/manicode/...)  │
│                                  │                                      │
│               ┌──────────────────┴──────────────────┐                   │
│               ▼                                     ▼                   │
│    [Active Session Found]                [No Session / Expired]         │
│  (expiresAt > now + 15s)                            │                   │
│               │                                     ▼                   │
│               │                         [Check Freebucks Balance]       │
│               │                                     │                   │
│               │                         Insufficient? ──► Failover Pool │
│               │                                     │                   │
│               │                                     ▼                   │
│               │                          [Pay & Rent New 1-Hr Slot]     │
│               │                                     │                   │
│               ▼                                     ▼                   │
│     [Stream Prompts (0 Coins)] ◄──────── [Save Session to Disk Cache]   │
│               │                                                         │
│               ▼                                                         │
│   [pi Shutdown / Restart] ──► (Keep Cloud Session Alive, DO NOT DELETE) │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1. Cross-Session Disk Persistence (จำ Session ข้ามการปิด-เปิดโปรแกรม)
- จัดเก็บ Session State ลงในไฟล์ `~/.config/manicode/freebuff-session-cache.json` โดยบันทึก:
  - `instanceId`: รหัส Session ของคลาวด์
  - `model`: โมเดลที่เช่าใช้งานในชั่วโมงนั้น
  - `expiresAt`: Timestamp วันเวลาหมดอายุ (คำนวณจาก 60 นาที)
  - `token`: รหัสบัญชีที่เป็นเจ้าของ Session
- เมื่อ pi CLI เริ่มต้นใหม่ ไม่ว่าจะเปิดจากโฟลเดอร์ใดบนเครื่อง ตัว Adapter จะอ่านไฟล์แคชนี้ก่อนเสมอ หาก Session ยังเหลือเวลาใช้งาน (เช่น เหลืออีก 40 นาที) จะนำ `instanceId` เดิมมาใช้งานต่อทันที **เสีย 0 เหรียญ**

### 2. Elimination of Premature Session Rotation (เอาการหมุน Token ทุก 25 คำขอออก)
- ยกเลิกตัวแปร `switchAfterRequests = 25` และตัวจับเวลาตัดรอบใน `TokenPool`
- **กฎใหม่ (Session-Bound Retention):** ตราบใดที่ Session ยังไม่หมดอายุและโมเดลตรงกับที่เช่าไว้ ระบบจะ **เกาะติดใช้งานบัญชีและ Session เดิมอย่างต่อเนื่อง 100%** จนกระทั่งหมดเวลา 60 นาที
- จะทำการสลับบัญชีเฉพาะกรณีที่:
  1. Session หมดอายุ และบัญชีปัจจุบันมีเหรียญไม่พอเปิดชั่วโมงใหม่ (Proactive Credit Failover)
  2. บัญชีปัจจุบันพบข้อผิดพลาดร้ายแรง เช่น `403 banned`
  3. ผู้ใช้สั่งสลับเองผ่านคำสั่ง `/freebuff rotate`

### 3. Graceful Lifecycle without Session Destruction (ไม่ลบ Session ทิ้งเมื่อปิดโปรแกรม)
- ใน event `session_shutdown`: ยกเลิกการเรียก `DELETE /api/v1/freebuff/session`
- ตัวคลาวด์ Session จะยังคง Active อยู่บนเซิร์ฟเวอร์จนครบอายุขัย 60 นาทีตามธรรมชาติ
- หากผู้ใช้ต้องการยกเลิก Session ด้วยตนเองเพื่อเปลี่ยนโมเดล สามารถกดสั่งได้ผ่านเมนู `/freebuff reset` หรือ `./manage.sh reset`

### 4. Transparent Real-Time Countdown in UI (แสดงเวลานับถอยหลัง)
- ในคำสั่ง `/freebuff` และแถบสถานะ:
  - คำนวณเวลาที่เหลือ: `remainingMinutes = Math.ceil((expiresAt - now) / 60000)`
  - แสดงผล: `Active Model: GLM 5.3 Flash (42m remaining)`
  - แสดงข้อมูลเหรียญ: ยอดคงเหลือประจำวัน, ยอดที่ใช้ไป, และเวลาที่จะรีเซ็ตโควต้า (14:00 น. เวลาไทย)

### 5. Smart Model-Lock Handling (รับมือการล็อกโมเดล)
- หากผู้ใช้พยายามเรียกโมเดล B ขณะที่ชั่วโมงของโมเดล A ยังไม่หมดอายุ:
  - เซิร์ฟเวอร์จะส่ง `409: model_locked` กลับมา
  - ตัว Adapter จะป้องกันไม่ให้เสียสิทธิ์ชั่วโมงเดิม โดยแจ้งเตือนผู้ใช้ถึงเวลาที่เหลือของโมเดล A และดำเนินการตอบคำถามต่อด้วยโมเดล A เพื่อรักษาสิทธิ์เหรียญของผู้ใช้

---

## Files to Modify

- `index.ts`:
  - เพิ่มฟังก์ชัน `saveSessionDisk()` และ `loadSessionDisk()`
  - ปรับปรุง `CodebuffClient.ensureSession()` ให้ตรวจเช็คและโหลด Session จากดิสก์ก่อนเปิดใหม่
  - ปรับปรุง `TokenPool.getActive()` ให้เกาะติด Session เดิมจนกว่าจะหมดเวลา 60 นาที (ยกเลิกกฎ 25 คำขอ)
  - ปรับปรุง `pi.on("session_shutdown")` ให้ปิดเฉพาะ HTTP server ภายใน ไม่ส่ง `DELETE` ไปทำลาย Session บนคลาวด์
  - อัปเดตเมนู `/freebuff` แสดงเวลานับถอยหลังเป็นนาทีอย่างแม่นยำ
- `manage.js`:
  - ตรวจสอบให้เมนู `[7] Clear / Reset Stale Cloud Sessions` ลบไฟล์แคชในเครื่องออกด้วยเมื่อผู้ใช้สั่งล้าง
- `README.md`:
  - อธิบายระบบ Freebucks Hourly Rental และฟีเจอร์ Session Persistence

---

## Reuse

- ฟังก์ชัน `safeFetch()` และ Proxy Dispatcher ที่สร้างไว้
- โครงสร้าง `SessionCache` และ `FreebucksInfo`
- พาธจัดเก็บคอนฟิกกลาง `~/.config/manicode/`

---

## Steps

- [ ] **Step 1: Session Disk Persistence Implementation**
  - สร้าง helper functions: `getSessionDiskPath()`, `saveSessionDisk()`, `loadSessionDisk()`
  - ผูกการบันทึกและอ่านแคชเข้ากับ `CodebuffClient` (constructor, ensureSession, heartbeat)
- [ ] **Step 2: Remove Periodic Sticky Rotation**
  - นำ `switchAfterRequests` และ `switchAfterDurationMs` ออกจาก `TokenPool`
  - ปรับแต่ง `TokenPool.getActive()` ให้เกาะติด Active Session จนกว่าจะหมดอายุ
- [ ] **Step 3: Update Session Shutdown Lifecycle**
  - ลบการเรียก `cleanupAll()` ออกจาก event `session_shutdown`
- [ ] **Step 4: Real-Time Session Countdown in `/freebuff`**
  - คำนวณเวลานับถอยหลังเป็นนาที (`remainingMinutes`) และแสดงใน `/freebuff`
  - แสดงรายละเอียดเหรียญ Freebucks (Daily Remaining / Granted)
- [ ] **Step 5: Model-Lock Handling & Credit Protection**
  - ปรับปรุง `ensureSession()` ให้รองรับการตอบกลับ `model_locked` โดยไม่ลบ Session ทิ้ง
- [ ] **Step 6: Documentation & Offline Verification**
  - ทดสอบจำลองการบันทึก/โหลด Session ข้ามโปรเซส
  - อัปเดตเอกสารภาษาอังกฤษใน `README.md`

---

## Verification

1. **ทดสอบ Disk Persistence:**
   - จำลองเปิด Session ด้วยโทเคนและตรวจสอบว่าไฟล์ `~/.config/manicode/freebuff-session-cache.json` ถูกสร้างขึ้น
   - ตรวจสอบว่าเมื่อเปิด Instance ใหม่ของ Client ตัวแคชเดิมถูกโหลดกลับมาใช้งานทันที
2. **ทดสอบ No Auto-Rotation:**
   - ทดสอบรันคำขอมากกว่า 25 ครั้ง และยืนยันว่าระบบยังคงใช้ Account และ Session เดิมตราบใดที่ยังไม่ครบ 60 นาที
3. **ทดสอบ Session Survival on Shutdown:**
   - ยืนยันว่าเมื่อปิดโปรแกรม ไม่มีการส่ง HTTP DELETE ไปยังเซิร์ฟเวอร์ Codebuff
