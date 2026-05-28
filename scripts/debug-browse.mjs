// 调试：直接打 Bangumi search 三个季度，确认数据真不同
const UA = "luis/anime-tracker (https://github.com/luis)";

async function testSeason(label, start, end) {
  const body = {
    sort: "heat",
    filter: { type: [2], air_date: [`>=${start}`, `<${end}`] },
  };
  const res = await fetch(
    "https://api.bgm.tv/v0/search/subjects?limit=50",
    {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const j = await res.json();
  console.log(`\n=== ${label} ===  total=${j.total} returned=${j.data?.length}`);
  for (const x of j.data.slice(0, 10)) {
    const name = x.name_cn || x.name;
    console.log(`  ${name}  date=${x.date}  score=${x.rating?.score}`);
  }
}

await testSeason("WINTER 2026 (上一季)", "2026-01-01", "2026-04-01");
await testSeason("SPRING 2026 (本季)", "2026-04-01", "2026-07-01");
await testSeason("SUMMER 2026 (下一季)", "2026-07-01", "2026-10-01");
