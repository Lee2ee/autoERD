# AutoERD

AI 기반 DB 모델링 및 ERD 자동 생성 플랫폼.

자연어 요구사항을 입력하면 엔티티를 자동 추출하고, ERD와 SQL DDL을 생성합니다.

---

## 주요 기능

- 한국어 요구사항 입력 → 엔티티/관계 자동 추출 (Kiwi 형태소 분석 + Groq AI 보조)
- React Flow 기반 ERD 시각화 및 드래그 편집
- 테이블 편집 ↔ ERD 양방향 실시간 동기화
- PostgreSQL DDL 자동 생성 (규칙 기반)
- **업무규칙(Business Rules)** — CHECK / UNIQUE / INDEX / CASCADE / DEFAULT / ENUM / NULLABLE / AUDIT 제약 추출 및 DDL 반영
- **정규화** — 1NF / 2NF / 3NF / BCNF 규칙 기반 또는 AI 기반 자동 정규화
- **IntelliJ 플러그인** — JPA `@Entity` / Prisma 파일 분석 → AutoERD 임포트
- Undo/Redo, JSON Export/Import, SQL 다운로드
- 프로젝트 저장/불러오기, 멤버 초대 (OWNER / EDITOR / VIEWER)
- JWT 인증, AES-256-GCM API 키 암호화
- Groq API 없어도 MockProvider로 동작

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| Frontend | React, TypeScript, Vite, Zustand, React Flow, TailwindCSS |
| Backend | Java 17, Spring Boot 3, Spring Security, JPA, PostgreSQL |
| AI Server | Python 3.11, FastAPI, Kiwi, Groq API (llama-3.3-70b-versatile) |
| IntelliJ Plugin | Kotlin, IntelliJ Platform SDK (JCEF 내장 브라우저) |
| Infra | Docker, Docker Compose, PostgreSQL, Redis |

---

## 요구사항

### Docker 실행 (권장)
- [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) 설치

### 로컬 개발 (선택)
- Node.js 20+
- Java 17+ (JDK)
- Python 3.11+

---

## 빠른 시작 (Docker)

```cmd
cd D:\workspace\autoDBmodeliing

:: .env 파일 생성 (루트)
copy .env.example .env
```

`.env` 파일을 열어 Groq API 키를 설정합니다 (선택 사항):

```
GROQ_API_KEY=gsk_xxxx
GROQ_MODEL=llama-3.3-70b-versatile
```

```cmd
docker-compose up --build
```

| 서비스 | URL |
|--------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8080 |
| AI Server | http://localhost:8000 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

---

## 로컬 개발 환경 설정

### Frontend

```cmd
cd frontend
npm install
npm run dev
```

http://localhost:3000 에서 확인

### Backend

```cmd
cd backend

:: application.yml 생성 (최초 1회)
copy src\main\resources\application.yml.example src\main\resources\application.yml
:: application.yml을 열어 비밀번호/시크릿 키 설정

gradlew.bat bootRun
```

> PostgreSQL이 로컬에서 실행 중이어야 합니다.
> `application.yml`은 `.gitignore`에 포함되어 있으므로 직접 생성해야 합니다.

### AI Server

```cmd
cd ai-server

python -m venv venv
venv\Scripts\activate

pip install -r requirements.txt

copy .env.example .env
:: .env에 GROQ_API_KEY 설정 (선택)

uvicorn app.main:app --reload --port 8000
```

---

## IntelliJ 플러그인

`intellij-plugin/` 디렉터리에 포함된 IntelliJ IDEA 플러그인으로, 기존 Java/Kotlin JPA 프로젝트나 Prisma 스키마를 AutoERD에 바로 가져올 수 있습니다.

### 빌드 및 설치

```cmd
cd intellij-plugin
gradlew.bat buildPlugin
```

`build/distributions/autoerd-intellij-plugin-*.zip` 을 IntelliJ → **Settings → Plugins → Install Plugin from Disk**에서 설치합니다.

### 사용 방법

1. 프로젝트 탐색기에서 `.java` / `.prisma` 파일 또는 폴더를 우클릭
2. **AutoERD로 분석** 선택
3. 분석 결과 다이얼로그에서:
   - **브라우저에서 열기** — AutoERD 앱에서 엔티티를 자동으로 가져옴
   - **JSON 복사** — 클립보드에 복사 후 앱의 '코드에서 가져오기'에 붙여넣기

### 플러그인 설정

**Settings → AutoERD** 에서 AutoERD 서버 URL을 설정합니다 (기본값: `http://localhost:3000`).

### 동작 원리

```
IDE 우클릭
    │
    ▼
AnalyzeEntityAction
    │  선택된 .java / .prisma 파일(또는 폴더) 수집
    │  build/, target/ 등 빌드 산출물 제외
    ▼
JpaEntityParser (regex 기반, PSI 불필요)
    │  @Entity 클래스 블록 추출 (중괄호 쌍 추적)
    │  @Table(name=...) → tableName
    │  @Id → isPrimary
    │  @Column(nullable=false) → isNullable
    │  @ManyToOne / @OneToMany / @OneToOne → 관계 추출
    │  Java 타입 → SQL DataType 매핑
    │    String → VARCHAR, Long → BIGINT, LocalDateTime → TIMESTAMP, ...
    │  경고: 참조 대상 클래스가 분석 범위에 없으면 "관계 대상 'X'을 찾을 수 없습니다"
    ▼
JpaParseResult { entities, relationships, warnings }
    │
    ▼
결과 다이얼로그
    ├── [브라우저에서 열기]
    │       JSON 직렬화
    │       → Base64URL 인코딩 (UTF-8)
    │       → BrowserUtil.browse("$serverUrl/projects/new#import=<encoded>")
    │       → 프론트엔드가 해시를 파싱해 entityStore에 바로 로드
    │
    └── [JSON 복사]
            JSON 직렬화 → 클립보드 복사
```

**파일을 여러 개 또는 폴더로 선택하면** 포함된 모든 `.java` / `.prisma` 파일을 한 번에 파싱하므로, 참조 관계(`@ManyToOne`, `@OneToMany` 등)도 올바르게 연결됩니다.

---

## VS Code 익스텐션

`vscode-extension/` 디렉터리에 포함된 VS Code 익스텐션으로, IntelliJ 플러그인과 동일한 분석 기능에 더해 **WebView 내장 브라우저**와 **마이그레이션 파일 저장** 기능을 제공합니다.

### 빌드 및 설치

```cmd
cd vscode-extension
npm install
npm run package
```

생성된 `autoerd-*.vsix` 파일을 VS Code → **Extensions → ... → Install from VSIX**에서 설치합니다.

### 명령어

| 명령어 | 설명 |
|--------|------|
| `AutoERD: 열기` | VS Code 내 WebView 패널로 AutoERD 앱을 엽니다 (iframe 내장) |
| `AutoERD로 분석` | `.java` / `.prisma` 파일 우클릭 또는 에디터 우클릭으로 현재 파일 분석 |
| `AutoERD: 폴더 내 엔티티 전체 분석` | 폴더 우클릭 → 하위 모든 `.java` / `.prisma` 파일 한 번에 분석 |
| `AutoERD: DDL을 마이그레이션 파일로 저장` | AutoERD 앱의 SQL DDL을 마이그레이션 파일 경로에 저장하도록 안내 |

### 설정

VS Code 설정(`settings.json` 또는 **Settings UI → AutoERD**)에서 변경합니다.

| 설정 키 | 기본값 | 설명 |
|---------|--------|------|
| `autoerd.serverUrl` | `http://localhost:3000` | AutoERD 프론트엔드 서버 URL |
| `autoerd.migrationFormat` | `flyway` | DDL 저장 포맷 (`flyway` / `liquibase` / `plain`) |
| `autoerd.migrationDir` | `src/main/resources/db/migration` | 마이그레이션 파일 저장 경로 (프로젝트 루트 기준) |

### 동작 원리

```
탐색기 / 에디터 우클릭
    │
    ▼
analyzeFile / analyzeFolder 커맨드
    │  .java 파일 → jpaParser.ts   (JPA @Entity 파싱)
    │  .prisma 파일 → prismaParser.ts (Prisma model 파싱)
    │  폴더 선택 시 target/**, build/** 제외하고 재귀 수집
    ▼
결과 알림 메시지 (N개 엔티티, M개 관계)
    ├── [브라우저에서 열기]
    │       JSON → Buffer.from(payload).toString('base64url')
    │       → vscode.env.openExternal("$serverUrl/projects/new#import=<encoded>")
    │
    └── [클립보드에 JSON 복사]
            vscode.env.clipboard.writeText(payload)
```

`AutoERD: 열기` 커맨드는 별도 WebView 패널을 생성하고 AutoERD 앱을 iframe으로 내장합니다.
서버 연결 전까지 "서버에 연결 중입니다..." 오버레이가 표시되며, 새로고침 버튼으로 재시도할 수 있습니다.

### IntelliJ 플러그인과의 차이점

| 항목 | IntelliJ 플러그인 | VS Code 익스텐션 |
|------|-------------------|-----------------|
| 내장 브라우저 | JCEF (IDE 내 탭) | WebView iframe |
| 파서 구현 | Kotlin (단일 파서) | TypeScript (jpaParser / prismaParser 분리) |
| 마이그레이션 저장 | 미지원 | `autoerd.saveDDL` 커맨드 지원 |
| 설정 포맷 | IntelliJ Settings UI | VS Code settings.json |

---

## Groq API 설정 (선택)

Groq API 키 없이도 MockProvider로 동작합니다.
AI 기능을 활성화하려면:

1. https://console.groq.com 에서 무료 API 키 발급
2. `.env` 파일에 키 설정:

```
GROQ_API_KEY=gsk_xxxx
```

또는 로그인 후 **설정 → Groq API Key** 에서 사용자별 키를 등록할 수 있습니다.

---

## 사용 방법

1. 로그인 후 프로젝트 생성
2. 요구사항 입력창에 한국어 요구사항 입력
   예: `"회원은 여러 상품을 주문할 수 있고 주문에는 배송정보가 포함된다."`
3. **AI 분석** 버튼 클릭 → 엔티티/관계/업무규칙 자동 추출
4. **엔티티 편집** 탭에서 컬럼 수정/추가/삭제
5. **ERD 다이어그램** 탭에서 시각적 편집
6. **정규화** 탭에서 1NF~BCNF 자동 정규화 적용
7. **업무규칙** 탭에서 CHECK / INDEX / CASCADE 등 제약 확인 및 토글
8. **SQL DDL** 탭에서 자동 생성된 SQL 확인 및 다운로드
9. **저장** 버튼으로 프로젝트 저장

---

## 프로젝트 구조

```
autoDBmodeliing/
├── frontend/               # React + TypeScript (Vite)
│   └── src/
│       ├── stores/         # Zustand 상태 (entityStore, authStore, ...)
│       ├── components/     # ERDCanvas, EntityTable, BusinessRulePanel, ...
│       └── utils/          # ddlGenerator, normalizer, naming
├── backend/                # Spring Boot 3
│   └── src/main/
│       ├── java/com/autoerd/
│       │   ├── domain/     # Entity, Project, User, UserApiKey, ...
│       │   └── service/    # ProjectService, DdlGeneratorService, ...
│       └── resources/
│           ├── application.yml.example  # 커밋 O (플레이스홀더)
│           └── application.yml          # 커밋 X (gitignore)
├── ai-server/              # Python FastAPI + NLP
│   └── app/
│       ├── providers/      # GroqProvider, MockProvider
│       └── services/       # nlp_service (Kiwi + AI 하이브리드)
├── intellij-plugin/        # IntelliJ IDEA 플러그인 (Kotlin)
│   └── src/main/kotlin/com/autoerd/plugin/
│       ├── parsers/        # JpaEntityParser (regex 기반)
│       └── actions/        # AnalyzeEntityAction
├── vscode-extension/       # VS Code 익스텐션 (TypeScript)
│   └── src/
│       ├── extension.ts    # 커맨드 등록 및 WebView
│       └── parsers/        # jpaParser, prismaParser
├── docker/
│   └── postgres-init.sql
├── docker-compose.yml
├── .env.example            # 커밋 O (플레이스홀더)
├── .env                    # 커밋 X (gitignore)
└── README.md
```

### 핵심 파일

| 파일 | 역할 |
|------|------|
| `frontend/src/stores/entityStore.ts` | 전체 상태의 Single Source of Truth |
| `frontend/src/utils/ddlGenerator.ts` | 규칙 기반 DDL 생성 (BusinessRule 반영) |
| `frontend/src/utils/normalizer.ts` | 규칙 기반 정규화 (1NF~BCNF) |
| `ai-server/app/services/nlp_service.py` | 하이브리드 NLP (Kiwi + AI) |
| `ai-server/app/providers/` | AI Provider 패턴 (Groq/Mock) |
| `intellij-plugin/src/.../parsers/JpaEntityParser.kt` | JPA/Prisma 파일 파싱 |

---

## API 명세

### AI Server (port 8000)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | /analyze | 요구사항 텍스트 분석 |
| GET | /health | 헬스체크 |

### Backend (port 8080)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | /api/auth/login | 로그인 |
| POST | /api/auth/register | 회원가입 |
| GET | /api/projects | 프로젝트 목록 |
| POST | /api/projects | 프로젝트 생성 |
| GET | /api/projects/{id} | 프로젝트 조회 |
| PUT | /api/projects/{id} | 프로젝트 수정 |
| DELETE | /api/projects/{id} | 프로젝트 삭제 |
| GET | /api/projects/{id}/sql | SQL DDL 생성 |
| POST | /api/ai/analyze | AI 분석 프록시 |
| GET | /api/users/me/api-keys | 사용자 API 키 목록 |
| POST | /api/users/me/api-keys | API 키 등록 |
| DELETE | /api/users/me/api-keys/{id} | API 키 삭제 |

---

## 설계 원칙

1. **Single Source of Truth** — `entityStore`가 모든 상태의 중심
2. **규칙 기반 우선, AI 보조** — SQL/ERD는 메타모델 기반으로 결정론적 생성
3. **양방향 동기화** — 테이블 편집 ↔ ERD 모두 entityStore에 반영
4. **Provider 패턴** — AI 모델 교체 가능 (Groq → 다른 LLM)

---

## 문제 해결

### Docker 빌드 실패 시
```cmd
docker-compose down -v
docker-compose up --build
```

### 포트 충돌 시
`docker-compose.yml`에서 포트 변경 후 재시작

### application.yml 없다는 오류
```cmd
copy backend\src\main\resources\application.yml.example backend\src\main\resources\application.yml
```
이후 `application.yml`을 열어 실제 값으로 교체 (`your_*_here` 항목)

### Windows에서 gradlew 권한 오류
```cmd
gradlew.bat bootRun
```
(`./gradlew` 대신 `gradlew.bat` 사용)

### AI 서버 venv 활성화 오류
PowerShell 사용 시:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
venv\Scripts\Activate.ps1
```

### IntelliJ 플러그인 "브라우저에서 열기" 빈 화면
AutoERD 앱(프론트엔드)이 실행 중인지 확인하세요.
플러그인 설정에서 서버 URL이 올바른지 확인하세요 (기본값: `http://localhost:3000`).
