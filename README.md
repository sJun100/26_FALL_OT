# 공룡 화석 발굴단 — 웹 운영 시스템 룰북

> 후기 새내기새로배움터 게임 **"공룡 화석 발굴단"** 의 전체 진행을 실시간으로 관리하는 웹 시스템  
> 오프라인 게임의 상태(뼈 보유량, 카드 교환, 오차율 산출 등)를 추적하고, 빔프로젝터로 학생들에게 보여주는 운영 도구

---

## 1. 게임 개요

### 1.1. 구조

- **참가**: 27반 ~ 31반, 총 5개 반
- **조 편성**: 각 반의 학생 약 20명을 A, B, C, D 4개 조로 분류
- **라운드**: 총 6라운드. 각 라운드는 5개 페이즈로 구성
- **승리 조건**: 6라운드 종료 후 화석 복원 오차율이 가장 낮은 반이 우승

### 1.2. 역할 로테이션표

| 라운드 | A조 | B조 | C조 | D조 |
|--------|-----|-----|-----|-----|
| 1, 2, 6 | 고고학자 (Archaeologist) | 발굴가 (Excavator) | 대학원생 (Researcher) | 밀거래상 (Smuggler) |
| 3 | 발굴가 | 대학원생 | 밀거래상 | 고고학자 |
| 4 | 대학원생 | 밀거래상 | 고고학자 | 발굴가 |
| 5 | 밀거래상 | 고고학자 | 대학원생 | 발굴가 |

### 1.3. 라운드 페이즈

| 페이즈 | 이름 | 설명 |
|--------|------|------|
| 1 | Plan | 고고학자가 조를 이끌어 이번 라운드 전략 수립 |
| 2 | Mission | 각 역할이 해당 방으로 이동하여 미션 수행 |
| 3 | Return | 방에서 돌아와 결과 공유 |
| 4 | Restoration | 카드 보상이 지급됨 (서버가 자동 처리) |
| 5 | Submission | 화석 복원 제출 (오차율 산출) |

---

## 2. 기술 스택

| 구성 요소 | 기술 |
|-----------|------|
| 백엔드 서버 | Node.js + Express |
| 실시간 통신 | Socket.io (WebSocket) |
| 데이터 저장 | SQLite3 (파일 기반 DB, 자동 생성) |
| 프론트엔드 | Vanilla HTML / CSS / JS |
| 디자인 테마 | 버건디 & 흑백 다크 모드 (이모지 배제, PNG 에셋 사용) |

---

## 3. 디렉토리 구조

```
dinosaur_fossil_expedition/
├── server.js                     서버 진입점 (Express + Socket.io + SQLite)
├── package.json
├── database.db                   SQLite DB (첫 실행 시 자동 생성)
│
├── data/
│   ├── answers.json              반별 정답 뼈 조합 { "27": {H, B, L, T}, ... }
│   ├── hints.json                힌트 카드 ID → 텍스트 매핑
│   ├── treasure_bone_cards.csv   뼈 카드 ID → 뼈 종류별 수량
│   └── excavator_rewards.csv     라운드별 포대(Sack) → 뼈 종류별 보상 수량
│
└── public/
    ├── index.html                역할 선택 허브 페이지
    ├── admin.html                Client X — 마스터 콘솔 (운영진 전용)
    ├── dashboard.html            Client A — 반별 대시보드 (빔프로젝터 화면)
    ├── excavator.html            Client B — 발굴가 드래프트
    ├── researcher.html           Client C — 대학원생 카드 스캐너
    ├── smuggler.html             Client D — 밀거래상 교환 패널
    ├── css/
    │   └── theme.css             전체 UI 테마 (버건디 & 흑백 다크 모드)
    ├── js/
    │   └── socket-client.js      소켓 공통 모듈 (state 수신, 라운드 전환 애니메이션)
    └── resources/
        ├── skull.png / torso.png / leg.png / tail.png   뼈 아이콘 이미지
        └── ...
```

---

## 4. 서버 실행

```bash
npm install
node server.js
# → http://localhost:3000 에서 접속
```

- **역할 선택 허브**: `http://localhost:3000/`
- **Admin**: `http://localhost:3000/admin.html`
- **반별 대시보드**: `http://localhost:3000/dashboard.html?class_id=27` (27~31)
- **발굴가**: `http://localhost:3000/excavator.html`
- **대학원생**: `http://localhost:3000/researcher.html`
- **밀거래상**: `http://localhost:3000/smuggler.html`

---

## 5. 데이터베이스 스키마

### classes (반 뼈 보유량)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| class_id | INTEGER (PK) | 반 번호 (27~31) |
| skull_count | INTEGER | 머리뼈 보유 수 |
| torso_count | INTEGER | 몸통뼈 보유 수 |
| leg_count | INTEGER | 다리뼈 보유 수 |
| tail_count | INTEGER | 꼬리뼈 보유 수 |

### game_state (게임 진행 상태)

| key | value |
|-----|-------|
| current_round | 1 ~ 6 |
| current_phase | 1 ~ 5 |

### cards_registry (카드 등록 및 교환)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| card_id | TEXT (PK) | 카드 ID (예: `1-A`, `2-H3`) |
| round | INTEGER | 등록된 라운드 |
| type | TEXT | `BONE` 또는 `HINT` |
| owner_class_id | INTEGER | 현재 소유 반 |
| status | TEXT | `PENDING` → `LOCKED`(교환완료) → `RELEASED`(보상지급) |
| is_locked | INTEGER | Smuggler가 교환 잠금 설정 시 1 |

### restoration_history (화석 복원 제출 이력)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER (PK) | 자동 증가 |
| class_id | INTEGER | 제출 반 |
| round | INTEGER | 제출 라운드 |
| skull_sub | INTEGER | 제출한 머리뼈 수 |
| torso_sub | INTEGER | 제출한 몸통뼈 수 |
| leg_sub | INTEGER | 제출한 다리뼈 수 |
| tail_sub | INTEGER | 제출한 꼬리뼈 수 |
| error_rate | REAL | 오차율 (%) |
| is_locked | INTEGER | Admin이 잠금 시 1 (잠금 후 수정 불가) |

---

## 6. 클라이언트별 상세 사용법

---

### 6.1. Client X — admin.html (마스터 콘솔)

**접속**: `http://localhost:3000/admin.html`  
**사용자**: 게임 운영 총괄 1명

#### 화면 구성

| 패널 | 기능 |
|------|------|
| Game Status | 현재 라운드/페이즈 표시 |
| Round & Phase Control | 라운드/페이즈 변경 |
| Timer | 타이머 설정 및 제어 |
| Emergency Alert | 모든 클라이언트에 긴급 공지 전송 |
| Bone Count Editor | 반별 뼈 수 수동 수정 |
| Fossil Submissions | 각 반의 복원 제출 현황 및 잠금/해제 |
| Ready Status | 각 클라이언트 Ready 상태 확인 |

#### 주요 조작 흐름

**라운드 시작 (Phase 1)**
1. `Round & Phase Control` → 라운드 선택 → `Set Round` 클릭
2. 타이머 자동 3분 시작됨 (Phase 1 기본값)
3. 고고학자 팀이 전략을 논의하는 동안 타이머 진행

**Phase 2~3 (미션 수행 / 귀환)**
1. `Set Phase` → `2` 클릭 → 각 역할 방으로 이동
2. 미션 완료 후 `Set Phase` → `3` 클릭

**Phase 4 (보상 지급)**
1. `Set Phase` → `4` 클릭
2. **서버가 자동으로** 이번 라운드에 등록된 뼈 카드/발굴가 배분 결과를 각 반의 뼈 보유량에 반영
3. `Status Boards` (대시보드)에서 자동 갱신 확인

**Phase 5 (화석 복원 제출)**
1. `Set Phase` → `5` 클릭
2. 각 반이 dashboard.html에서 뼈 수를 입력하고 Submit
3. `Fossil Submissions` 패널에서 제출 현황 확인
4. 제출 완료된 반에 대해 `Lock` 클릭 → 더 이상 수정 불가

**랭킹 공개 및 다음 라운드 진행**
1. `Reveal Ranks` 버튼 클릭 (최소 1반이 제출해야 활성화)
2. 모든 대시보드 화면에 랭킹 오버레이가 표시됨
3. 8초 후 자동으로 다음 라운드로 진행 (Phase 1, 타이머 5분 자동 시작)
4. 원하면 `Hide Ranks` 버튼으로 수동 닫기 (이 경우 라운드 자동 진행 없음)

**6라운드 최종 랭킹**
1. `Reveal Ranks` → `isFinal=true` 플래그 전송
2. 1등 반의 카드에 금색 테두리와 glow 효과 표시
3. 자동 진행 없이 영구 표시 (수동으로 `Hide Ranks` 클릭 필요)

**수동 오버라이드**
- `Bone Count Editor`: 특정 반의 뼈 수를 직접 수정 (오류 수정용)
- `Override` 버튼: 특정 반의 제출 수치를 강제로 변경 후 오차율 재계산

**긴급 공지**
1. `Emergency Alert` 패널에 메시지 입력
2. `Send Alert` → 모든 클라이언트의 화면 상단에 공지 배너 표시
3. `Close Alert` → 배너 제거

**게임 초기화**
- `http://localhost:3000/api/reset` POST 요청 → 모든 카드, 뼈, 제출 이력 초기화

---

### 6.2. Client A — dashboard.html (반별 대시보드)

**접속**: `http://localhost:3000/dashboard.html?class_id=27` (27~31 중 해당 반 번호)  
**사용자**: 각 반 디렉터 (5명). 빔프로젝터 화면으로 띄워놓음

#### 화면 구성 (항상 표시)

| 영역 | 내용 |
|------|------|
| 헤더 — 타이틀 | `Class XX Dashboard` |
| 헤더 — 타이머 | 현재 남은 시간 (00:00 형식, 시간 만료 시 깜빡임) |
| 헤더 — Round/Phase | 현재 라운드와 페이즈 번호 |
| 헤더 — Ready 버튼 | 준비 완료 신호 전송 (토글) |
| 헤더 — Status Boards 버튼 | 보조 정보 모달 열기/닫기 |
| Fossil Inventory | 현재 반의 뼈 보유량 (Skull / Torso / Leg / Tail) |
| Group Roles | 현재 라운드의 A~D 조별 역할 |
| Past Restorations | 과거 라운드별 제출 기록 및 랭킹 (#1 ~ #5) |
| Unlocked Hints | RELEASED 상태의 힌트 카드 내용 (라운드별 정렬) |

#### Phase 5에서만 표시

| 영역 | 내용 |
|------|------|
| Submit Fossil Restoration | Skull / Torso / Leg / Tail 수 입력 후 제출 |

> **주의**: 제출 수치는 현재 보유량을 초과할 수 없음. Admin이 Lock하면 수정 불가.

#### Status Boards 모달

`Status Boards` 버튼 클릭 시 전체 화면 모달 팝업:

| 패널 | 내용 |
|------|------|
| Excavator Distributions | 이번 라운드 각 반에 배정된 Sack 이름 |
| Global Treasure Hunt Board | 모든 반의 현재 라운드 카드 현황 (Class / Card ID / Type / Status / Contents) |

> Contents 열: BONE 카드는 뼈 종류별 수량을 PNG 아이콘과 함께 표시

#### 랭킹 공개 오버레이

Admin이 `Reveal Ranks` 클릭 시:
- 전체 화면을 덮는 **Round Results** 오버레이 표시
- 각 반의 결과가 1초 간격으로 아래에서 위로 순차 등장 (최하위 → 최상위 순)
- 6라운드(최종 라운드)의 1등 반: 금색 테두리 + glow 효과
- 8초 후 자동으로 닫히고 다음 라운드로 전환
- 오버레이가 닫힌 후에는 **Past Restorations** 표에서 해당 라운드 랭킹 영구 확인 가능

#### Ready 기능

- `Ready` 버튼을 클릭하면 `Ready OK` 상태로 변경
- Admin 화면의 `Ready Status` 패널에 실시간으로 반영

#### 힌트 감정권 사용

- `[TICKET]` 태그가 붙은 힌트 카드는 클릭하면 취소선 처리 (로컬 저장)
- 사용한 감정권은 반투명 처리되어 한눈에 구분 가능

---

### 6.3. Client B — excavator.html (발굴가 드래프트)

**접속**: `http://localhost:3000/excavator.html`  
**사용자**: 발굴가 방 디렉터 (1명)  
**사용 시점**: Phase 2 — 발굴가 미니게임 결과에 따라 뼈 포대 배분

#### 화면 구성

| 영역 | 내용 |
|------|------|
| Draft Assignments | 각 반(27~31)에 배정할 Sack 선택 드롭다운 |
| Sack Contents | 현재 라운드의 Sack별 뼈 수량표 |
| Finalize Distribution 버튼 | 배분 결정 및 서버 전송 |
| Reset All 버튼 | 현재 드래프트 초기화 |

#### 사용법

1. 미니게임 결과에 따라 각 반에 적합한 Sack을 드롭다운으로 선택
2. 우측 패널에서 각 Sack의 뼈 구성 확인 (Skull / Torso / Leg / Tail / Total)
3. 모든 반에 Sack 배정이 완료되면 `Finalize Distribution` 버튼 활성화
4. 클릭 시 서버에 전송 → 서버가 각 반의 뼈 보유량에 즉시 반영
5. 배분은 **Phase 4 이전에만** 실행해야 함 (Phase 4 전환 시 서버가 별도 카드 보상도 자동 지급)

> **중요**: `Finalize Distribution`을 한 번 클릭하면 서버가 실제로 뼈를 추가함.  
> 실수로 중복 클릭 시 뼈가 2번 추가되므로 주의. 필요 시 Admin에서 `Bone Count Editor`로 수동 수정.

---

### 6.4. Client C — researcher.html (대학원생 카드 스캐너)

**접속**: `http://localhost:3000/researcher.html`  
**사용자**: 대학원생 방 디렉터 (1명)  
**사용 시점**: Phase 2 — 보물찾기 미션에서 획득한 카드를 등록

#### 화면 구성

| 영역 | 내용 |
|------|------|
| Pending Pool | 현재 라운드에 등록된 카드 목록 (Class / Card ID / Type / Status) |
| Card Registration | 카드 ID 입력 및 소유 반 선택 후 등록 |

#### 사용법

1. **소유 반 선택**: 드롭다운에서 카드를 획득한 반(27~31) 선택
2. **카드 ID 입력**: 텍스트 박스에 카드 ID 입력 (예: `1-A`, `2-H3`)
   - 여러 카드를 한 번에 입력 시 줄바꿈 또는 쉼표로 구분
3. **Register Cards** 클릭
4. 서버가 유효성 검사:
   - 존재하지 않는 카드 ID → 오류 메시지
   - 현재 라운드와 다른 라운드의 카드 → 오류 메시지
   - 이미 등록된 카드 → 오류 메시지
5. 등록 성공 시 Pending Pool에 즉시 표시
6. 잘못 등록한 카드는 `Delete` 버튼으로 삭제 (PENDING 상태인 경우만 가능)

> **BONE 카드**: 등록 시 뼈 보유량에 즉시 반영되지 않음.  
> Admin이 Phase 4로 전환할 때 서버가 모든 BONE 카드를 일괄 처리하여 반영함.

> **HINT 카드**: 등록 후 Admin이 Phase 4로 전환하면 RELEASED 상태로 변경되어 해당 반 dashboard에 힌트 내용이 표시됨.

---

### 6.5. Client D — smuggler.html (밀거래상 교환 패널)

**접속**: `http://localhost:3000/smuggler.html`  
**사용자**: 밀거래상 방 디렉터 (1명)  
**사용 시점**: Phase 2 — 두 반 사이의 카드를 강제 교환

#### 화면 구성

| 영역 | 내용 |
|------|------|
| Smuggler Pending Pool | 현재 라운드 전체 카드 현황 (카드 아이콘으로 뼈 구성 표시) |
| Exchange Panel | 교환할 카드 2개 선택 후 Confirm Exchange |

#### 사용법

1. **교환 카드 선택**:
   - 좌측 드롭다운: 내가 줄 반 / 카드
   - 우측 드롭다운: 상대방 반 / 카드
2. **Lock Card (선택적)**: 내 카드 1개를 잠금 → 이 카드는 상대가 선택 불가
   - 잠금은 반당 1개만 허용 (새로 잠그면 이전 잠금 해제)
3. **Confirm Exchange** 클릭
   - 선택한 두 카드의 소유 반이 교환됨
   - 두 카드 모두 `LOCKED` 상태로 변경 (더 이상 재교환 불가)
4. Pending Pool에서 교환 결과를 실시간 확인

> **LOCKED 카드**: 교환 완료된 카드는 다시 교환 불가.  
> Admin의 Phase 4 전환 시 LOCKED 포함 모든 미처리 카드가 RELEASED로 일괄 처리됨.

---

## 7. 주요 자동화 흐름

### Phase 4 전환 시 서버 자동 처리

Admin이 Phase를 4로 변경하면:
1. 현재 라운드의 모든 `PENDING` + `LOCKED` 카드를 RELEASED로 일괄 변경
2. BONE 카드의 뼈 수량을 해당 반의 `classes` 테이블에 누적 합산
3. 모든 클라이언트에 `state:update` 이벤트 전송 → 즉시 UI 갱신

### 라운드 전환 시 서버 자동 처리

Admin이 라운드를 변경하거나 Reveal Ranks 후 8초가 지나면:
1. 라운드 번호 증가, Phase를 1로 초기화
2. Ready 상태 전체 초기화
3. 타이머 5분 자동 시작
4. 모든 클라이언트에 `ROUND X` 전환 애니메이션 표시

---

## 8. REST API

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/export` | GET | 전체 게임 로그 텍스트 파일 다운로드 |
| `/api/reset` | POST | 게임 초기화 (카드, 뼈, 로그, 라운드 모두 리셋) |

---

## 9. 오차율 계산 공식

```
N = 정답 뼈 총합 (Skull + Torso + Leg + Tail)
E = |제출 Skull - 정답 Skull| + |제출 Torso - 정답 Torso|
  + |제출 Leg - 정답 Leg| + |제출 Tail - 정답 Tail|

Error Rate = (E / N) × 100 (%)
```

- 1~5라운드: 소수점 반올림하여 정수% 표시
- 6라운드(최종): 소수점 2자리까지 표시 (예: `66.25%`)

---

## 10. 데이터 파일 수정 가이드

### answers.json (정답 변경 시)

```json
{
  "27": { "H": 20, "B": 15, "L": 10, "T": 5 },
  "28": { "H": 18, "B": 12, "L": 8, "T": 6 },
  ...
}
```
- H: Skull(머리뼈), B: Torso(몸통뼈), L: Leg(다리뼈), T: Tail(꼬리뼈)
- **수정 후 서버 재시작 필요**

### hints.json (힌트 텍스트 수정 시)

```json
{
  "27": {
    "1-H1": "The skull count is greater than the tail count.",
    "1-H2": "감정권: 이 힌트를 사용하면 정답 범위를 알 수 있습니다."
  },
  ...
}
```
- 키: `{반번호}` → 카드 ID → 힌트 텍스트
- `감정권` 포함 시 대시보드에서 클릭 가능한 감정권 형태로 렌더링
- **수정 후 서버 재시작 필요**

### treasure_bone_cards.csv (뼈 카드 구성 변경 시)

```csv
card name,skull bone,torso bone,leg bone,tail bone
1-A,2,1,0,0
1-B,0,3,1,0
...
```

### excavator_rewards.csv (포대 보상 변경 시)

```csv
round,sack,skull bone,torso bone,leg bone,tail bone
1,A. Skull-Focused Sack,8,2,1,1
1,B. Torso-Focused Sack,2,8,1,1
...
```

---

## 11. 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| 랭킹 오버레이가 안 뜸 | 해당 라운드에 제출 데이터 없음 | Phase 5에서 각 반이 Submit 후 Admin이 Reveal Ranks |
| Reveal Ranks 버튼이 비활성화 | 아직 아무 반도 제출 안 함 | 최소 1반이 Submit 하면 활성화 |
| 뼈 수가 음수 | 수동 입력 오류 | Admin의 Bone Count Editor로 수정 (서버가 MAX(0, value)로 보정) |
| 카드 등록 실패 | 라운드 불일치, 중복, 또는 존재하지 않는 ID | researcher.html 오류 메시지 확인 |
| 화면이 갱신 안 됨 | 소켓 연결 끊김 | 우측 하단 연결 표시등 확인 (빨간색 = 연결 끊김). 페이지 새로고침 |
| Phase 4 전환 후 뼈 미반영 | 카드가 PENDING이 아닌 다른 상태 | server.js 로그에서 경고 메시지 확인 |

---

## 12. 게임 진행 체크리스트

### 매 라운드 시작 전

- [ ] Admin에서 올바른 라운드 번호 설정 확인
- [ ] 각 반 dashboard.html이 올바른 class_id로 접속됐는지 확인
- [ ] 연결 표시등이 모두 초록색인지 확인
- [ ] Ready 상태가 모두 초기화됐는지 확인

### Phase 2 진행 중

- [ ] Excavator: 미니게임 결과에 따라 Sack 배정 후 Finalize 클릭
- [ ] Researcher: 보물찾기 획득 카드 등록
- [ ] Smuggler: 해당되는 경우 카드 교환

### Phase 4 전환 시

- [ ] Admin이 Phase 4 클릭 → 뼈 자동 반영 확인
- [ ] 각 반 대시보드에서 Fossil Inventory 숫자가 갱신됐는지 확인

### Phase 5 종료 후

- [ ] 모든 반이 Submit 완료했는지 확인
- [ ] Admin이 각 반 Lock 클릭
- [ ] Reveal Ranks 클릭
