# 공룡 화석 발굴단 통합 웹 시스템

후기 새내기새로배움터 게임 "공룡 화석 발굴단"의 전체 진행을 실시간으로 관리하는 웹 시스템이다.
게임 그 자체가 아니라, 오프라인에서 진행되는 게임의 상태(뼈 보유량, 카드 교환, 오차율 산출 등)를 추적하고 빔프로젝터를 통해 학생들에게 보여주기 위한 운영 도구이다.

---

## 1. 프로젝트 개요

### 1.1. 게임 구조 요약

- 27반~31반까지 총 5개 반이 참여한다.
- 각 반의 학생 약 20명을 A, B, C, D 4개 조로 나누어 라운드마다 역할을 로테이션한다.
- 역할: 고고학자(강의실), 발굴가(미니게임), 대학원생(보물찾기), 밀거래상(강제 교환)
- 총 6라운드를 진행하며, 매 라운드는 5개의 페이즈로 구성된다.
- 최종 6라운드 제출 화석의 오차율이 가장 낮은 반이 우승한다.

### 1.2. 기술 스택

| 구성 요소 | 기술 |
|-----------|------|
| 백엔드 서버 | Node.js + Express |
| 실시간 통신 | Socket.io (WebSocket) |
| 데이터 저장 | SQLite3 (파일 기반 DB) |
| 프론트엔드 | Vanilla HTML/CSS/JS |
| 디자인 테마 | 버건디 & 흑백 다크 모드 (이모티콘 배제, PNG 에셋 활용) |

### 1.3. 클라이언트 구성

| 클라이언트 | 파일 | 용도 | 접속자 |
|------------|------|------|--------|
| Client X | admin.html | 전체 게임 제어 (마스터 콘솔) | 운영진 1명 |
| Client A | dashboard.html | 반별 대시보드 (빔프로젝터 화면) | 각 반 디렉터 (5명) |
| Client B | excavator.html | 발굴가 미니게임 보상 배분 | 발굴가 방 디렉터 |
| Client C | researcher.html | 보물찾기 카드 등록 | 대학원생 방 디렉터 |
| Client D | smuggler.html | 밀거래상 강제 교환 | 밀거래상 방 디렉터 |

---

## 2. 디렉토리 구조

```
dinosaur_fossil_expedition/
├── server.js                     서버 진입점. Express 라우팅, Socket.io 이벤트, SQLite 연동
├── package.json                  Node.js 패키지 설정
├── database.db                   SQLite DB 파일 (서버 최초 실행 시 자동 생성)
│
├── data/                         게임 설정 데이터 (JSON)
│   ├── answers.json              반별 정답 뼈 조합 (H, B, L, T). 절대 변경 불가 원칙
│   └── hints.json                힌트 카드 ID별 영문 텍스트 매핑. HTML 태그 사용 가능
│
├── resources/                    원본 기획 자료 (코드에서 직접 참조하지 않음)
│   ├── excavator_rewards.csv     라운드별 뼈 포대(Sack) 보상 수량표
│   ├── treasure_bone_cards.csv   라운드별 뼈조각 카드의 뼈 구성표
│   ├── hints_example.csv         힌트 카드 텍스트 예시 (한국어)
│   └── 룰북 초안 2차.pdf         게임 규칙서 원본
│
└── public/                       프론트엔드 정적 파일
    ├── index.html                역할 선택 허브 페이지
    ├── admin.html                Client X (마스터 콘솔)
    ├── dashboard.html            Client A (반별 대시보드)
    ├── excavator.html            Client B (발굴가 드래프트)
    ├── researcher.html           Client C (보물찾기 스캐너)
    ├── smuggler.html             Client D (밀거래상 교환)
    ├── css/
    │   └── theme.css             전체 UI 테마 스타일시트 (버건디 및 흑백 톤)
    ├── img/                      (사용 안함, 리소스는 resources/ 사용)
    ├── resources/                클라이언트 UI에 사용되는 뼈 이미지 파일 (skull.png 등)
    └── js/
        └── socket-client.js      소켓 통신 공통 모듈
```

---

## 3. 데이터베이스 스키마

서버가 처음 실행되면 database.db 파일이 자동 생성되고, 아래 테이블 4개가 초기화된다.

### 3.1. classes (반 상태)

각 반의 실시간 뼈 보유량을 저장한다. 라운드를 거듭하며 누적된다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| class_id | INTEGER (PK) | 반 번호 (27, 28, 29, 30, 31) |
| skull_count | INTEGER | 머리뼈 보유 수 (초기값 0) |
| torso_count | INTEGER | 몸통뼈 보유 수 |
| leg_count | INTEGER | 다리뼈 보유 수 |
| tail_count | INTEGER | 꼬리뼈 보유 수 |

### 3.2. game_state (게임 진행 상태)

현재 라운드와 페이즈 번호를 키-값 쌍으로 저장한다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| key | TEXT (PK) | "current_round" 또는 "current_phase" |
| value | TEXT | 해당 값 (문자열) |

### 3.3. cards_registry (카드 등록 및 교환 내역)

보물찾기에서 발견된 카드의 소유권과 상태를 추적한다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| card_id | TEXT (PK) | 카드 고유 ID (예: "1-Bone A", "1-1") |
| round | INTEGER | 등록된 라운드 번호 |
| type | TEXT | "HINT" 또는 "BONE" |
| owner_class_id | INTEGER | 현재 소유 반 번호 |
| status | TEXT | "PENDING", "LOCKED", "RELEASED" |

상태 전이: PENDING(등록 직후) -> LOCKED(교환 완료) -> RELEASED(Phase 4에서 일괄 지급)

### 3.4. restoration_history (화석 복원 제출 이력)

각 반이 매 라운드마다 제출한 화석 조합과 자동 계산된 오차율을 기록한다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER (PK, AI) | 자동 증가 인덱스 |
| class_id | INTEGER | 제출 반 번호 |
| round | INTEGER | 제출 라운드 |
| skull_sub | INTEGER | 제출한 머리뼈 수 |
| torso_sub | INTEGER | 제출한 몸통뼈 수 |
| leg_sub | INTEGER | 제출한 다리뼈 수 |
| tail_sub | INTEGER | 제출한 꼬리뼈 수 |
| error_rate | REAL | 오차율 (소수점 둘째 자리) |
| is_approved | INTEGER | 운영진 승인 여부 (0: 대기, 1: 승인) |

---

## 4. 실시간 통신 구조

모든 클라이언트는 socket-client.js를 통해 서버와 WebSocket으로 연결된다.

### 4.1. 공통 흐름

1. 클라이언트가 브라우저에서 페이지를 열면 자동으로 소켓 연결이 수립된다.
2. 연결 즉시 getState 이벤트를 발신하여 서버로부터 전체 게임 상태를 수신한다.
3. 서버에서 어떤 변경이 발생하면 state:update 이벤트를 모든 클라이언트에 브로드캐스트한다.
4. 각 클라이언트 페이지는 window.onStateUpdate 함수를 구현하여 수신된 상태로 화면을 갱신한다.

### 4.2. 서버 -> 클라이언트 이벤트

| 이벤트 | 설명 |
|--------|------|
| state:update | 전체 게임 상태(라운드, 페이즈, 반별 뼈, 카드 목록) 전송 |
| sync:phase | 페이즈 강제 전환 알림 |
| sync:card_exchanged | 밀거래 교환 성공 알림 |

### 4.3. 클라이언트 -> 서버 이벤트

| 이벤트 | 발신 클라이언트 | 설명 |
|--------|----------------|------|
| getState | 모든 클라이언트 | 접속 시 전체 상태 요청 |
| admin:setPhase | Client X | 페이즈 번호 변경 |
| admin:setRound | Client X | 라운드 번호 변경 |
| admin:updateBones | Client X | 특정 반의 특정 뼈 수량 가감 |
| admin:startTimer | Client X | 게임 진행 타이머 시작 |
| admin:stopTimer | Client X | 게임 진행 타이머 정지 |
| admin:revealResults | Client X | 오차율 기반 순위 순차적 공개 |
| admin:hideResults | Client X | 오차율 순위 화면 숨김 |
| admin:lockRestoration | Client X | 특정 반의 화석 제출 상태 확정(Lock) |
| admin:unlockRestoration | Client X | 특정 반의 화석 제출 상태 잠금 해제 |
| clientC:addCards | Client C | 보물찾기에서 발견한 카드 등록 |
| clientC:deleteCard | Client C | 잘못 등록한 카드 삭제 (PENDING 상태만) |
| clientD:exchangeCards | Client D | 밀거래 강제 교환 실행 |
| clientB:submitDraft | Client B | 발굴가 포대 배분 결과 제출 |
| clientA:submitRestoration | Client A | 화석 복원 뼈 조합 제출 (재제출 가능, Lock 이후 불가) |

---

## 5. 핵심 게임 로직

### 5.1. 오차율 계산

각 반에는 data/answers.json에 고유한 정답 조합(H*, B*, L*, T*)이 고정되어 있다.
스태프가 화석을 제출하면 서버가 자동으로 다음 공식을 적용한다:

```
절대 오차량 E = |H - H*| + |B - B*| + |L - L*| + |T - T*|
오차율(%) = (E / N*) x 100    (N* = H* + B* + L* + T*, 약 140)
```

소수점 둘째 자리까지 표기한다 (예: 8.52%).

### 5.2. 뼈 인벤토리 규칙

- 뼈는 라운드를 걸쳐 계속 누적된다. 감소하지 않는다.
- 화석 제출 시 뼈가 소비(차감)되지 않는다. 평가 후 반환되는 개념이다.
- 제출 수량은 보유량을 초과할 수 없다 (클라이언트 측 유효성 검사).

### 5.3. 카드 상태 전이

```
[스캔] -> PENDING -> [교환] -> LOCKED -> [Phase 4 전환] -> RELEASED
                              또는
[스캔] -> PENDING -> [Phase 4 전환] -> RELEASED (교환 없이 바로 지급)
```

Phase 4로 전환하는 순간, 해당 라운드의 PENDING/LOCKED 카드가 모두 RELEASED로 변경되고, BONE 타입 카드의 뼈가 해당 반의 인벤토리에 자동 가산된다.

### 5.4. 페이즈 구성

| 번호 | 이름 | 내용 |
|------|------|------|
| 1 | Planning | 전략 수립 시간 |
| 2 | Execution | 보물찾기(Client C) 및 발굴가 미니게임(Client B) 진행 |
| 3 | Smuggling | 밀거래상 강제 교환(Client D) 진행 |
| 4 | Distribution | 카드 일괄 지급. BONE 카드의 뼈가 인벤토리에 반영됨 |
| 5 | Fossil Restore | 화석 복원 제출 및 오차율 결과 공개 |

모든 페이즈 전환은 수동이다. 타이머가 0이 되어도 자동으로 넘어가지 않으며, 반드시 운영진(Client X)이 버튼을 눌러야 한다.

---

## 6. 설치 및 실행

### 6.1. 사전 요구사항

- Node.js (v18 이상 권장)
- npm (Node.js와 함께 설치됨)

### 6.2. 설치

```bash
cd dinosaur_fossil_expedition
npm install
```

### 6.3. 서버 실행

```bash
node server.js
```

기본 포트는 3000이다. 서버가 정상 가동되면 "Server listening on port 3000" 메시지가 출력된다.

### 6.4. 접속

같은 네트워크(Wi-Fi)에 연결된 장비의 브라우저에서 아래 주소로 접속한다.
localhost 자리에 서버 PC의 IP 주소를 넣으면 다른 장비에서도 접속 가능하다.

| 페이지 | 주소 |
|--------|------|
| 역할 선택 | http://localhost:3000/ |
| 마스터 콘솔 | http://localhost:3000/admin.html |
| 27반 대시보드 | http://localhost:3000/dashboard.html?class_id=27 |
| 28반 대시보드 | http://localhost:3000/dashboard.html?class_id=28 |
| 29반 대시보드 | http://localhost:3000/dashboard.html?class_id=29 |
| 30반 대시보드 | http://localhost:3000/dashboard.html?class_id=30 |
| 31반 대시보드 | http://localhost:3000/dashboard.html?class_id=31 |
| 발굴가 | http://localhost:3000/excavator.html |
| 보물찾기 | http://localhost:3000/researcher.html |
| 밀거래상 | http://localhost:3000/smuggler.html |

### 6.5. 데이터 초기화

리허설 후 본 게임을 시작하기 전에 database.db 파일을 삭제하고 서버를 재시작하면 모든 데이터가 0으로 리셋된다.

---

## 7. 클라이언트별 사용법

### 7.1. Client X - 마스터 콘솔 (admin.html)

운영진이 게임 전체를 제어하는 화면이다.

기능 목록:
- 현재 라운드/페이즈 확인
- Set Round: 드롭다운에서 라운드를 선택하고 버튼을 누르면 전체 게임의 현재 라운드가 변경된다
- Force Phase: 드롭다운에서 페이즈를 선택하고 버튼을 누르면 모든 클라이언트의 페이즈가 강제 전환된다
- Manual Bone Edit: 특정 반의 특정 뼈 종류에 양수 또는 음수를 입력하여 보유량을 직접 조정한다 (패널티, 보너스 등)
- Timer: 전체 게임의 타이머를 설정(1~30분), 시작, 정지할 수 있으며 클라이언트 화면에 동기화된다.
- Submission Approvals: 제출된 화석 조합을 확인하고 잠금(Lock)/해제(Unlock)하여 최종 확정한다.
- Reveal Rankings: 제출된 화석의 오차율(%)을 바탕으로 순위를 순차적으로 클라이언트 화면에 공개한다.
- Classes State: 5개 반의 현재 뼈 보유량을 실시간으로 표시한다
- DB 초기화 및 로그 내역 추출(Export Log) 기능 지원

모든 조작에는 확인(confirm) 창이 뜬다.

### 7.2. Client A - 반별 대시보드 (dashboard.html)

각 반의 강의실 빔프로젝터에 띄우는 학생용 화면이다.
URL 끝에 ?class_id=27 형식으로 반 번호를 지정해야 한다. 지정하지 않으면 prompt 창이 뜬다.

화면 구성:
- 상단: 반 이름, 타이머 동기화 화면, 현재 라운드/페이즈
- 중앙 상단: 뼈 인벤토리 (시각적인 PNG 아이콘과 함께 4종류 뼈의 보유량 표시)
- 조별 역할 로테이션: 해당 라운드의 역할(고고학자, 발굴가 등) 배정 결과를 안내
- 좌측 하단: 해제된 힌트 목록 (RELEASED된 HINT 카드의 텍스트)
- 우측 하단: 보물찾기 공개창 (현재 라운드의 모든 카드 등록/교환 현황)
- Phase 5에서만: 화석 복원 제출 폼이 나타남 (Lock 되기 전까지 여러 번 수정 및 제출 가능)

화석 제출 시 각 뼈의 보유량을 초과하는 숫자를 입력하면 에러가 발생하고 제출이 차단된다. 운영진이 결과 공개(Reveal)를 활성화하면 반별 순위가 순차적 애니메이션과 함께 오버레이로 뜬다.

### 7.3. Client B - 발굴가 드래프트 (excavator.html)

미니게임 결과에 따라 1~5위를 매기고, 각 반에 뼈 포대를 배분하는 화면이다.

사용법:
1. Rank 1부터 5까지, 각 rank에 해당하는 반을 드롭다운에서 선택한다.
2. 각 rank 옆의 Sack 버튼(A~E) 중 하나를 클릭한다. 선택된 Sack은 다른 rank에서 비활성화된다.
3. 같은 반을 두 번 선택하면 에러가 뜬다.
4. 5개 rank 모두 반과 Sack이 지정되면 Finalize Distribution 버튼이 활성화된다.
5. 버튼을 누르면 서버로 전송되어 해당 Sack의 뼈가 각 반 인벤토리에 자동 반영된다.
6. Reset All 버튼으로 선택을 초기화할 수 있다.

### 7.4. Client C - 보물찾기 스캐너 (researcher.html)

대학원생 방 디렉터가 학생들이 찾아온 물리적 카드의 ID를 시스템에 등록하는 화면이다.

사용법:
1. Card ID 입력란에 카드에 적힌 ID를 타이핑한다 (예: "1-Bone A", "1-1").
2. Type 드롭다운에서 Hint Card 또는 Bone Card를 선택한다.
3. Found By Class 드롭다운에서 카드를 찾은 반을 선택한다.
4. Register Card 버튼을 누르면 서버에 PENDING 상태로 등록된다.
5. Enter 키를 눌러도 등록이 가능하다 (빠른 연속 스캔용).
6. 현재 라운드에 속하지 않는 카드 ID를 입력하면 경고와 함께 차단된다.
7. 우측의 Recent Scans 목록에서 PENDING 상태의 카드를 Undo 버튼으로 삭제할 수 있다.
8. 등록 성공 시 화면이 잠깐 녹색으로 깜빡인다.

### 7.5. Client D - 밀거래상 교환 (smuggler.html)

밀거래상 교환 순서에 따라, 각 반이 다른 반의 PENDING 카드를 1장 강탈하고 자신의 카드 1장을 넘겨주는 화면이다.

사용법:
1. Acting Class에서 교환 순번이 된 반을 선택한다.
2. My Card to Give에서 내가 넘겨줄 카드를 선택한다.
3. Target Class to Steal From에서 상대 반을 선택한다.
4. Target's Card to Steal에서 뺏어올 카드를 선택한다.
5. Execute Exchange를 누르면 두 카드의 소유권이 교환되고 LOCKED 상태가 된다.
6. 보유 카드가 0장이면 Pass 버튼으로 차례를 넘긴다.
7. 우측 Pending Pool 테이블에서 현재 교환 가능한 카드 목록을 확인할 수 있다.

주의: 교환 실행 취소(Undo) 기능은 없다. 실수 시 운영진(Client X)에서 수동 조정해야 한다.

---

## 8. 데이터 파일 편집 가이드

### 8.1. answers.json

각 반의 정답 뼈 조합을 정의한다. 게임 시작 전 확정하고 절대 변경하지 않는다.
H(Skull), B(Torso), L(Leg), T(Tail)의 합계가 약 140이 되도록 설정한다.

```json
{
  "27": { "H": 30, "B": 50, "L": 40, "T": 20 },
  "28": { "H": 25, "B": 45, "L": 45, "T": 25 }
}
```

### 8.2. hints.json

힌트 카드 ID와 반 번호를 기준으로, 해당 카드가 해제되었을 때 보여줄 영문 텍스트를 정의한다.
HTML 태그를 사용하여 특정 단어에 색상을 입힐 수 있다.

카드 ID는 hints_example.csv의 id 컬럼과 정확히 일치해야 한다 (예: "1-1", "2-3").
같은 카드 ID라도 반마다 다른 텍스트를 표시할 수 있다.

```json
{
  "27": {
    "1-1": "The <span style='color:orange;'>Skull</span> fragments outnumber the Tail.",
    "1-2": "This dinosaur had a large body."
  },
  "28": {
    "1-1": "The <span style='color:orange;'>Torso</span> fragments are dominant."
  }
}
```

---

## 9. 최근 업데이트 내역 및 배포 준비 상태 (Release Ready)

본 프로젝트는 대규모 리팩토링 및 최종 품질 감사(Quality Audit)를 성공적으로 마쳤으며, 100% Production-Ready 상태입니다.

- **디자인 규칙 통일**: 기존의 이모티콘 사용을 전면 배제하고 리소스 폴더의 실제 PNG 아이콘(Skull, Torso, Leg, Tail)으로 대체했습니다. 색상 역시 버건디(#440000) 및 흑백 기반으로 강제 통일하여 시각적 완성도를 높였습니다.
- **기능 추가 및 개선**: 타이머 동기화 기능, 조별 역할(A,B,C,D) 로테이션 자동 안내, 페이즈 4 전환 시 파티클 기하학 도형 효과, 오차율 순위 순차 공개(Reveal) 기능이 완벽히 적용되었습니다. 또한 제출된 화석의 재제출 및 운영진 잠금(Lock) 시스템도 도입되었습니다.
- **서버 및 보안 무결성 확보**: 모든 소켓 통신(Socket.io) 페이로드에 대해 엄격한 타입 검증(`Array.isArray()`, `parseInt()`)을 추가하여 클라이언트가 전송한 비정상적인 데이터로 인해 서버가 다운되거나 오차율 데이터(`NaN`)가 오염되는 보안 취약점을 완전히 차단했습니다. 사용하지 않는 의존성 패키지도 제거되었습니다.
