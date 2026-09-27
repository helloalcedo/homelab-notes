# Particle experience provenance

## User-supplied reference

사용자가 이 프로젝트의 동작·시각 참고 자료로 제공한 로컬 `video-site-replica/dist/`의 세 파일을 확인했다.

| Reference file | SHA-256 | 참고한 범위 |
| --- | --- | --- |
| `particles.js` | `0b9fc501b2fda31624c4d7b4c316f04a186e5836f0bd4cb67c4e5ed14d79e61d` | 하나의 WebGL 입자 풀, 장면별 target geometry, spring·pointer·ripple motion, Canvas 2D fallback |
| `app.js` | `71862e9302280f820c1feb73a7eef73868b136df1cecfa020cd7288db145fce8` | scroll progress, 여섯 장면 상태, 현재 장면 접근성, 장면 내비게이션, 테마와 입력 이벤트 연결 |
| `style.css` | `8e0c6f26b70a6792e7da9883a845afefee49c5ae7371eaa5c389c131fe652fd6` | 전체 화면 고정 canvas, scene overlay, ink/paper 팔레트, 작은 레이블과 넓은 여백, 검색 pill 배치 |

이 폴더에서 해당 소스의 라이선스를 설명하는 파일은 확인하지 못했다. 따라서 라이선스는 **unknown**으로 기록하며, 사용자 제공 및 기술적 출처를 기록하는 것이 사용·재배포 권리를 주장하는 것은 아니다.

## Local adaptation

2026-09-28 재설계 이후 홈의 실행 경로는 다음 파일이다.

- `assets/js/particles.js`: 하나의 입자 풀, WebGL·Canvas 2D 렌더러, 장면 사이의 슬롯 배정, 포인터·파문 변위, 수면 반영 패스, 글 읽기 전환
- `assets/js/morph.js`: Knothe–Rosenblatt 순위 대응, 5차 이징, 비행 곡선
- `assets/js/scenes/kingfisher.js`: 00 장면의 물총새·가지·수면과 00→01 잠수
- `assets/js/scenes/story.js`, `assets/js/scenes/shapes.js`: 01–05 장면의 형태
- `assets/js/experience.js`, `assets/css/experience.css`: 스크롤 스프링, 장면 문구의 등장·퇴장, 접근성, 대체 경로
- `assets/js/kingfisher-mark.js`: 정적 페이지 푸터·소개·404의 작은 입자 물총새

참고 소스에서 이어받은 것은 구조적인 방식이다. 전체 화면에 고정된 하나의 WebGL 입자 풀, 스크롤 진행값에 따른 장면 전환, 포인터 반발과 클릭 파문, Canvas 2D 대체, 짙은 먹색 바탕과 작은 모노 라벨의 단순한 배치가 여기에 해당한다. 참고 소스의 제품 이름, 문구, 폼 동작과 장면 의미는 가져오지 않았다.

물총새의 윤곽은 이 사이트를 위해 새로 그린 벡터 경로(1000×700 설계 좌표, `scenes/kingfisher.js`의 `PATHS`)다. 사진이나 다른 작품을 따라 그리지 않았다. 장면 순서는 다음과 같다.

1. 가지 위의 물총새와 수면, 반영
2. 네트워크 트리
3. 프로젝트 위젯과 `hugo.toml` 코드
4. 노트 두 장
5. 실험 → Hugo·Velog·GitHub → 기록의 발행 흐름
6. 검색 알약

입자 좌표는 로컬 DOM 레이아웃과 viewport에서 다시 계산한다. 위젯·노트·흐름 노드·검색 알약은 실제 HTML 요소의 위치를 측정해 그 주변을 그린다.

## Continuous-pool contract

여섯 장면은 서로 다른 입자 인스턴스를 만들지 않는다. breakpoint가 바뀌어 pool을 다시 할당하는 경우를 제외하면 같은 particle buffer가 장면 진행값에 따라 다음 target으로 이동한다. 첫 진입에는 입자 물총새만 보이고, 헤더와 장면 내비게이션은 첫 장면을 벗어난 뒤 나타난다.

DOM section은 캔버스가 담당하지 않는 제목, 설명, 링크, 검색 입력과 접근성 이름을 제공한다. WebGL을 사용할 수 없으면 Canvas 2D renderer를 시도하고, renderer가 준비되지 않거나 초기화가 실패하면 향상 클래스를 제거해 이 section을 일반 문서 흐름으로 되돌리는 것이 설계 계약이다. reduced motion에서는 animation loop 대신 현재 target의 정적 frame을 사용한다.

## Font licensing

참고 파티클 소스와 사이트 폰트의 출처는 별개다. Instrument Serif와 자체 호스팅한 Noto Serif KR WOFF2 subset은 `static/fonts/`에 각각의 SIL Open Font License 1.1 문서를 포함한다. 이 폰트 라이선스는 참고 파티클 소스에 적용되지 않으며 그 소스의 unknown 라이선스 상태를 바꾸지 않는다.

## Validation status

이 문서는 출처와 구현 의도를 기록한다. 실제로 실행한 브라우저 검증은 `docs/design.md`의 검증 기록에 적는다. GitHub Pages 배포는 별도로 확인하기 전까지 완료로 주장하지 않는다.
