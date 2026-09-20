# 생활 전반으로 범위 확장

2026-09-20 기준. 실제 카탈로그는 **15개 분야·22개 제품 브랜드·470개 제품/적용 계열·134개 부품·134개 판매 항목·573개 적용/제외 근거**다. 동일 브랜드의 유사 외형을 근거로 부품을 연결하지 않았다. 완제품 모델, 제조사가 명시한 계열, 자전거 캘리퍼 등 관찰 대상인 구성품 모델이 함께 포함된다.

| 분야 | 등록 제품/계열 | 부품과 주요 근거 |
|---|---:|---|
| 자전거·이동용품 | 31 | [SHIMANO B05S-RX](https://bike.shimano.com/en-NZ/products/service-and-upgrade-parts/pdp.P-BP-B05S-RX.html) 적용 캘리퍼. 자전거 전체 이름으로 브레이크를 확정하지 않음 |
| 전자제품·청소가전 | 127 | Dyson 공기청정기 14개 코드의 [필터](https://www.dyson.co.kr/360-glass-hepa-carbon-air-purifier-filter), TP04/TP07 [리모컨](https://www.dyson.co.kr/remote-control-969154-02), 청소기 12계열의 툴·호스 |
| 가구·수납 | 13 | IKEA BILLY 폭 40/80, 높이 106/202cm. [36cm 선반](https://www.ikea.com/kr/ko/p/billy-shelf-white-50525270/), [76cm 선반](https://www.ikea.com/kr/ko/p/billy-shelf-white-90525273/), 2014년 이전 제외 조건 |
| 학용품·사무용품 | 20 | UNI JETSTREAM 단색 SXR-7 적용 3계열, [Tombow MONO zero](https://www.tombow.com/en/products/mono_zero/) 원형 EH-KUR의 ER-KUR 리필 |
| 주방·정수용품 | 8 | BRITA 정수 용기 계열의 [MAXTRA PRO](https://www.brita.kr/filters-cartridges/maxtra-pro-pure-performance-valuepack-3-cartridges). 큐브·라크·수도꼭지형에 일반화하지 않음 |
| 욕실·개인 위생 | 10 | Philips [HX9026/98](https://www.philips.co.kr/c-p/HX9026_98/standard-sonic-toothbrush-heads) 공식 호환 목록의 전체 HX 모델, 공유 본체 코드 HX684P는 2후보 유지 |
| 공구·취미용품 | 18 | OLFA PL-1·WD-AL/BRN·CL·NOL-1/BB·MXP-AL 제조사 교체 날 안내와 LB-10B 국내 상품 |
| 원예·야외용품 | 3 | GARDENA 18201·18241·938용 [01124-80 와셔 세트](https://us.gardena.com/collections/quick-connect-system/products/gardena-01124). 지역별 접미 코드 확인 조건 |
| 반려동물 용품 | 18 | PetSafe Drinkwell의 [PAC00-13067](https://www.petsafe.com/p/drinkwell-carbon-replacement-filters-3-pack/PAC00-13067/) 적용 계열. Drinkwell 전체 공용으로 확대하지 않음 |
| 육아용품 | 6 | Bugaboo Cameleon 3/3 plus [앞바퀴 세트](https://www.bugaboo.com/us-en/parts/bugaboo-cameleon-3-front-wheels-MI000812.html). 서스펜션 미포함·세대 확인 |
| 의류·가방·재봉 | 6 | SINGER 221·222·301용 [판매처 대체 보빈](https://singer-featherweight.com/products/bobbins-roll-of-10). `seller`, `aftermarket`로 기록. 301의 실감기 축 예외 보존 |
| 여행·운동용품 | 4 | Forclaz MT500 등산 스틱의 [8580865 팁 보호캡](https://www.decathlon.co.uk/p/set-of-2-hiking-pole-caps/324372/c184m8580865). 같은 이름의 배낭·물주머니와 구분 |
| 청소·세탁도구 | 7 | Vileda UltraMax·Turbo·H2PrO Flat 등 계열별 교체 패드. 상호 미호환 명시를 제외 근거로 보존 |
| 욕실·배수설비 | 2 | IKEA LILLVIKEN 싱글·더블 배수트랩의 마개·커버·추가연결부 |
| 물병·텀블러 | 197 | 기존 5브랜드 자료와 써모스 공식 패킹 적용 목록의 전체 모델 코드. 숫자로 용량을 추정하지 않음 |

## 화면과 서버

- 첫 화면은 전체 생활용품에서 시작하고, 분야별 부품 선택과 25개 부품 종류의 확인 항목을 제공한다. 아직 자료가 없는 손잡이·튜브 등은 구매 가능을 주장하지 않는다.
- 기타 부품에서 가방 버클·지퍼·재봉 부품 등 필요한 이름과 장착 규격을 입력하고 검색·문의로 이어간다. 카탈로그에 없는 상품 링크는 생성하지 않는다.
- 분야 필터, 분야 내 브랜드 필터, 용량 필터, 해당 부품의 국내 경로/최근 주문 가능 필터를 조합한다. 초기 탐색은 여러 분야를 교대로 표시한다.
- 사진 후보는 전체 모델 코드의 정확 일치를 유지한다. 명확한 브랜드·용량과 모델이 충돌하면 재확인한다. 같은 본체 코드·BILLY 계열의 여러 규격은 선택지로 남긴다.
- 부품별 안내는 브레이크 캘리퍼·패드 재질, 필터 구성, 선반 프레임·세대, 펜 리필 코드, 클릭온 칫솔, 보빈 종류·실감기 축 등으로 구분된다.
- HTTP 요청의 분야를 기록에 보존한다. 기존 분야 없는 기록과 기존 제품 자료도 읽을 수 있다.

## 검증과 한계

- `npm run check`: 관찰·게이트웨이·권한·HTTP·분야별 적용/구매 경로·교차 규격 제외·용량 정확 비교·브랜드 충돌 테스트 및 서버/클라이언트 빌드.
- 실제 AI API로 합성 라벨 3장(DYSON TP04, SHIMANO BR-MT200, IKEA BILLY)을 검사했다. 모델 1개·1개·4개 후보 처리를 모두 통과했다. [호출 결과](../artifacts/daily-label-evaluation/report.json). 실제 물건 사진 정확도나 정확도 향상률을 측정한 결과는 아니다.
- 신규 공개 URL 36개를 검사해 OLFA 주소 오류와 Canyon 이동 주소를 정정했다. 403·시간 초과는 접근 제한으로 취급하고 품절·단종을 추정하지 않는다. [HTTP 기록](../artifacts/catalog-daily-links.json).
- 삼성 CFX-G100D·LG ADQ75133532는 공식몰의 활성 구매 버튼과 국내 배송 안내를 확인해 확인 시각을 기록했다. 나머지 신규 부품의 판매 상태는 `unknown`이다. 외국 공식몰 경로는 해외 및 한국 배송 미확인을 표시한다. 검색 결과·제조사 근거·판매 링크를 분리하며 가격, 재고, 배송, 직접 장착을 보장하지 않는다.
- [검수 목록](../artifacts/catalog-daily-life-review.json)과 `data/history`에 변경 이력을 남겼다. 웹 전체 실시간 검색 API는 연결하지 않았다. 외부 배포는 실행하지 않았다.

2026-09-20 추가 검증: 삼성 AX 28개 모델, LG AS/FS 전체 접미 코드 73개, IKEA BESTÅ 3개 조합과 국내 공식 부품 5개를 추가했다. LG PFPCBA01은 메인 집진 필터가 아닌 별매 특화필터임을 명시했다. 상세 검증 결과는 [배포 전 검증](predeployment-validation.md)에 기록했다.

2026-09-20 균형 확장: 물병 외 65개 제품·계열과 23개 부품을 추가했다. 위 표의 수량은 최신이며, PAX 선반·Brother 테이프·다색 펜 리필·9mm 커터 날·유모차 바퀴·보빈·급수기 필터·등산 스틱의 추가 적용 범위와 한계는 [카탈로그 균형 확장](catalog-balanced-expansion.md)에 정리했다.
