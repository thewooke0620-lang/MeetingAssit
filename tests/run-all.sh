#!/bin/sh
# 전체 테스트 실행. 하나라도 실패하면 0 이 아닌 값으로 끝난다.
# 필요한 것: Node.js 와 Playwright(크로미움 포함). 실제 API 는 부르지 않고 가짜 응답으로 확인한다.
export LANG=C.UTF-8 LC_ALL=C.UTF-8   # 한글 파일 이름 내려받기 확인에 필요
cd "$(dirname "$0")" || exit 1
fail=0
for t in core.test.js *.e2e.js; do
  printf '%s ... ' "$t"
  if node "$t" > "/tmp/meeting-test-$$.log" 2>&1 && ! grep -q "PAGEERR" "/tmp/meeting-test-$$.log"; then echo OK; else echo FAILED; tail -30 "/tmp/meeting-test-$$.log"; fail=1; fi
done
rm -f "/tmp/meeting-test-$$.log"
[ "$fail" = 0 ] && echo "모든 테스트 통과" || echo "실패한 테스트가 있습니다"
exit $fail
