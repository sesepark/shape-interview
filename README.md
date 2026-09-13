# shape-interview — SHAPE 2기 선발 결과 조회

지원자가 이름과 학번을 입력해 본인의 선발 결과를 확인하는 정적 페이지입니다.
조회 결과는 준회원 합격 41명, 정회원 합격 7명, 불합격 14명으로 구성됩니다.

## 개인정보 처리 방식

공개 배포 파일에는 이름과 학번을 넣지 않습니다. 비공개 `tools/results.json`의
`이름|학번`을 PBKDF2-HMAC-SHA256으로 변환하고, 공개 파일에는 16바이트 조회 키와
결과 코드만 저장합니다. 입력값은 서버로 전송되지 않고 브라우저 안에서만 비교됩니다.

## 파일 구성

```text
index.html                  결과 조회 화면
assets/app.js               조회 및 세 결과 화면 표시
assets/app.css              반응형 화면 스타일
assets/results.js           공개용 조회 키와 결과 코드
tools/results.json          비공개 결과 원본(.gitignore)
tools/results.example.json  원본 파일 형식 예시
tools/build_results.py      비공개 원본을 공개 데이터로 변환
```

## 결과 데이터 생성

```bash
python3 tools/build_results.py
```

빌드 도구는 결과 파일을 만들기 전에 전체 62명, 준회원 합격 41명, 정회원 합격
7명, 불합격 14명인지 확인합니다. 이름이나 학번이 중복되거나 학번이 아홉 자리가
아니면 빌드를 중단합니다.

## 로컬 실행

```bash
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000`을 열어 확인합니다.
