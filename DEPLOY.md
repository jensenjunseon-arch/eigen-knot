# Vercel 배포 가이드

이 앱은 Vercel에서 **그대로 돌아갑니다**. 캡처는 서버리스 함수에서 `@sparticuz/chromium`
(헤드리스 크로미움)으로 실행되고, 그 브라우저가 *배포된 자기 자신*의 캡처 페이지를 열어
스크린샷합니다. 폰트는 같은 배포본에서 로드되므로 두부(□□□)가 없습니다.

## 1. Vercel에 import (대시보드, 2분)

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository**
2. `jensenjunseon-arch/eigen-knot` 선택 → **Import**
3. Framework는 **Vite**로 자동 감지됨 (Build `npm run build`, Output `dist`). 그대로 둠.
4. **Environment Variables**에 추가:
   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | `sk-ant-...` (console.anthropic.com, 크레딧 필요) |
   | `STUDIO_PASSWORD` | 원하는 비밀번호 (이걸로 접근을 막습니다) |
   | `GEMINI_API_KEY` | *(선택)* AI 배경 생성용 (aistudio.google.com → API key). 없으면 해당 버튼만 에러를 띄우고 나머지는 정상 동작 |
   | `VITE_SUPABASE_URL` | *(선택)* 로그인/계정용 Supabase Project URL (`https://xxxx.supabase.co`). 빌드 시 클라이언트에 포함됨 |
   | `VITE_SUPABASE_ANON_KEY` | *(선택)* Supabase anon public 키 (`eyJ...`). **공개값** — RLS가 데이터를 보호함 |
5. **Deploy** → 1~2분 후 `https://eigen-knot-xxxx.vercel.app` 생성

> **로그인(매직링크) 설정** — 위 두 `VITE_SUPABASE_*` 변수가 있어야 로그인 버튼이 동작합니다.
> 로컬 개발은 프로젝트 루트 `.env`에 같은 두 변수를 넣으세요. 그리고 Supabase 대시보드
> → **Authentication → URL Configuration → Redirect URLs** 에 앱 주소를 추가해야 매직링크가
> 돌아옵니다: `http://localhost:5173` (개발) + 배포 URL(`https://<your>.vercel.app`).
> (무료 플랜은 기본 이메일 발송이 시간당 몇 통으로 제한되니, 사용량이 늘면 SMTP를 연결하세요.)

> CLI로 하려면: `npm i -g vercel && vercel link && vercel --prod` 후 대시보드(또는
> `vercel env add`)에서 위 두 변수를 설정.

## 2. 사용

배포된 URL 접속 → 비밀번호 입력 → 글 붙여넣기 → **AI 초안 만들기** → 카드 다듬기 →
이미지 업로드 → **PNG 10장 내보내기** (ZIP 다운로드).

## 동작 한도 / 비용

- **요금제**: Hobby(무료)면 충분. 함수 한도는 `vercel.json`에 캡처 `maxDuration 60s` /
  `memory 1769MB`로 설정됨. 카드 10장 캡처는 콜드스타트 포함 보통 ~20초.
- **이미지**: 업로드 사진은 클라이언트에서 ≤1440px JPEG로 축소되어 전송됨 (Vercel 본문
  4.5MB 한도 회피 + 캡처 속도↑).
- **크레딧**: AI 초안은 본인 `ANTHROPIC_API_KEY`로 호출됩니다. `STUDIO_PASSWORD`가
  이 키를 보호합니다.

## 문제 해결

- **AI 초안 400 (크레딧/키)**: `ANTHROPIC_API_KEY`가 설정됐는지, 크레딧이 있는지 확인.
- **캡처 500 (브라우저 실행 실패)**: `@sparticuz/chromium@133`(Chromium 133)과
  `playwright-core@1.50`은 CDP 프로토콜이 맞춰진 쌍입니다 — 한쪽만 올리면
  "Target ... has been closed"로 죽습니다. 그래도 실패하면 함수 `memory`를
  2048~3009로 올리거나, Vercel 빌드에 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`(이미
  `vercel.json`에 설정됨)이 적용됐는지 확인.
- **로컬 vs 배포**: 로컬 `npm run dev`는 풀 `playwright`(맥에서 동작), 배포는
  서버리스 크로미움 — 같은 캡처 코어(`capture/serverless.mjs`)를 공유합니다.
