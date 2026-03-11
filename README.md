# 🚀 컨테이너 시뮬레이터 Firebase 배포 가이드

## 폴더 구조
```
firebase-deploy/
├── public/
│   └── index.html        ← 시뮬레이터 본체
├── firebase.json         ← Firebase Hosting 설정
├── .firebaserc           ← 프로젝트 ID 설정
└── README.md
```

---

## 1단계 — Firebase 프로젝트 생성 (최초 1회)

1. https://console.firebase.google.com 접속
2. **"프로젝트 추가"** 클릭
3. 프로젝트 이름 입력 (예: `container-sim`)
4. 생성 완료 후 **프로젝트 ID** 복사 (예: `container-sim-abc12`)

---

## 2단계 — .firebaserc 수정

`.firebaserc` 파일에서 `YOUR_PROJECT_ID`를 실제 프로젝트 ID로 교체:

```json
{
  "projects": {
    "default": "container-sim-abc12"
  }
}
```

---

## 3단계 — Firebase CLI 설치 & 배포

터미널에서 아래 순서대로 실행:

```bash
# Firebase CLI 설치 (최초 1회)
npm install -g firebase-tools

# 로그인
firebase login

# 이 폴더로 이동
cd firebase-deploy

# 배포!
firebase deploy --only hosting
```

---

## 완료!

배포 성공 시 터미널에 아래처럼 URL이 출력돼:

```
✔  Deploy complete!
Hosting URL: https://container-sim-abc12.web.app
```

그 URL로 어디서든 접속 가능 🎉

---

## 업데이트 방법

`public/index.html` 수정 후:

```bash
firebase deploy --only hosting
```

끝!
