# AutoERD

AI 기반 DB 모델링 및 ERD 자동 생성 플랫폼.

자연어 요구사항을 입력하면 엔티티를 자동 추출하고, ERD와 SQL DDL을 생성합니다.

---

## 주요 기능

- 한국어 요구사항 입력 → 엔티티/관계 자동 추출 (Kiwi 형태소 분석 + Groq AI 보조)
- React Flow 기반 ERD 시각화 및 드래그 편집
- 테이블 편집 ↔ ERD 양방향 실시간 동기화
- PostgreSQL DDL 자동 생성 (규칙 기반, AI 미사용)
- Undo/Redo, JSON Export/Import, SQL 다운로드
- 프로젝트 저장/불러오기, 멤버 초대 (OWNER/EDITOR/VIEWER)
- Groq API 없어도 MockProvider로 동작

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| Frontend | React, TypeScript, Vite, Zustand, React Flow, TailwindCSS |
| Backend | Java 17, Spring Boot 3, Spring Security, JPA, PostgreSQL |
| AI Server | Python 3.11, FastAPI, Kiwi, Groq API (llama-3.3-70b-versatile) |
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

## Groq API 설정 (선택)

Groq API 키 없이도 MockProvider로 동작합니다.
AI 기능을 활성화하려면:

1. https://console.groq.com 에서 무료 API 키 발급
2. `.env` 파일에 키 설정:

```
GROQ_API_KEY=gsk_xxxx
```

## 사용 방법

1. 로그인 후 프로젝트 생성
2. 요구사항 입력창에 한국어 요구사항 입력
   예: `"회원은 여러 상품을 주문할 수 있고 주문에는 배송정보가 포함된다."`
3. **AI 분석** 버튼 클릭 → 엔티티/관계 자동 추출
4. **엔티티 편집** 탭에서 컬럼 수정/추가/삭제
5. **ERD 다이어그램** 탭에서 시각적 편집
6. **SQL DDL** 탭에서 자동 생성된 SQL 확인 및 다운로드
7. **저장** 버튼으로 프로젝트 저장

---

## 프로젝트 구조

```
autoDBmodeliing/
├── frontend/          # React + TypeScript (Vite)
├── backend/
│   └── src/main/resources/
│       ├── application.yml.example  # 커밋 O (플레이스홀더)
│       └── application.yml          # 커밋 X (gitignore)
├── ai-server/         # Python FastAPI + NLP
├── docker/
│   └── postgres-init.sql
├── docker-compose.yml
├── .env.example       # 커밋 O (플레이스홀더)
├── .env               # 커밋 X (gitignore)
└── README.md
```

### 핵심 파일

| 파일 | 역할 |
|------|------|
| `frontend/src/stores/entityStore.ts` | 전체 상태의 Single Source of Truth |
| `frontend/src/utils/ddlGenerator.ts` | 규칙 기반 DDL 생성 |
| `ai-server/app/services/nlp_service.py` | 하이브리드 NLP (Kiwi + AI) |
| `ai-server/app/providers/` | AI Provider 패턴 (Groq/Mock) |

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

---

## 설계 원칙

1. **Single Source of Truth** - `entityStore`가 모든 상태의 중심
2. **규칙 기반 우선, AI 보조** - SQL/ERD는 메타모델 기반으로 결정론적 생성
3. **양방향 동기화** - 테이블 편집 ↔ ERD 모두 entityStore에 반영
4. **Provider 패턴** - AI 모델 교체 가능 (Groq → 다른 LLM)

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
