# Helioz — дизайн-описание (инстанс Pantheon Design System)

Канон семейства: `~/Desktop/Desktop Archive/Projects/pantheon-design-system/DESIGN-SYSTEM.md`.
Правило семьи: новый проект = новый бог + та же колонна + та же палитра/материал/свет.

## Инстанс

| | |
|---|---|
| **Бог** | Гелиоз (Helios) — единственный, кто работает каждый день без выходных: гонит солнечную колесницу по небу, видит всё, не останавливается |
| **Смысл для проекта** | непрерывность 24/7 (колесница не встаёт), всевидение (отбивки и ledger), рассвет (утренняя сводка владельцу после ночной работы) |
| **Компаньон-символ** | сияющий солнечный диск + четвёрка коней колесницы (четыре прибора такта: gate · zeus · exec · council) |
| **Константа семьи** | классическая белая мраморная колонна — в каждом кадре |
| **Акценты** | голубой `#B8D6EA` — поток задач (публичное); золото `#C9A87A` — решения владельца и маркеры (ценное). У Гелиоза золото чуть теплее обычного — рассветное |

Палитра, свет, материал, CSS-токены — строго §2, §3, §5 канона (ivory `#F3EFE8`, мрамор,
мягкий дневной свет сверху-слева, frosted-glass карты, НИКОГДА тёмный фон и чистый чёрный).

## Как генерятся визуалы

Рабочий путь на этой машине — codex CLI с инструментом `image_gen.imagegen`; якорь стиля прикладывается
флагом `-i`:

```bash
codex --ask-for-approval never exec --skip-git-repo-check -s workspace-write --ephemeral \
  -i "~/Desktop/Desktop Archive/Projects/pantheon-design-system/emblems/style-anchor.png" \
  "<бриф из промптов ниже>"
```

Альтернатива при доступе к Higgsfield — `nano_banana_pro`, тот же якорь как `medias role:image`.
Промпты ниже одинаково годятся обоим.

## Промпты генерации

**Эмблема (1:1, 2k):**
```
Project emblem composition: a serene white marble statue of Helios crowned with a radiant
sun-disc halo, standing beside a classical white marble column, one hand resting on a marble
chariot wheel. Light, airy, warm-ivory Apple product-page aesthetic, white marble.
Soft natural daylight from upper-left, gentle long shadows, generous negative space.
Accent palette: soft sky-blue (#B8D6EA) and warm muted gold (#C9A87A).
Calm, premium, crisp 8k render. No readable text, no letters.
Match the light warm-ivory marble aesthetic of the reference.
```

**Hero (16:9, 4k):**
```
Serene premium hero composition: a white marble statue of Helios with a glowing golden
sun-disc drives a marble chariot with four horses beside a classical white marble column;
from the chariot's path a glowing terminal prompt emits soft blue and gold threads that
assemble into a layered frosted-glass conveyor of translucent cards moving toward a sunrise.
Light, airy, warm-ivory Apple product-page aesthetic, white marble. Soft natural daylight
from upper-left, gentle long shadows, generous negative space. Accent palette: soft sky-blue
(#B8D6EA) and warm muted gold (#C9A87A). Calm, premium, crisp 8k render.
No readable text, no letters. Match the light warm-ivory marble aesthetic of the reference.
```

**Диаграмма такта (16:9, 2k, labeled):**
```
Clean elegant flow diagram of frosted-glass cards connected by thin sky-blue arrows, a white
marble column at the left edge, warm-ivory background. Cards labeled: "Queue", "Gate",
"Executor", "Blind Verifier", "Integrity Marker", "Telegram Report", "Night Council", "Ledger".
Golden thin thread loops from "Night Council" back to "Queue". Legible accurate text.
Light, airy Apple product-page aesthetic. Match the reference style.
```

Файлы класть: `docs/assets/helioz-emblem.png` (иконка проекта), `docs/assets/helioz-hero.png`,
`docs/assets/helioz-flow.png`. Проверять глазами до коммита (свет светлый? колонна есть? текст точный?).
Схемы — только картинками канона, mermaid не вставлять (рендерится тёмным у вьюера).

## Готовые файлы (сгенерированы 24.08.2026 через codex image_gen, якорь — style-anchor семейства)

| Файл | Что | Проверено глазами |
|---|---|---|
| `docs/assets/helioz-hero.png` | hero 16:9: Гелиос с солнечным диском у колонны, стеклянный терминал, нити, конвейер карт к рассвету | да, текста нет, палитра семьи |
| `docs/assets/helioz-emblem.png` | эмблема 1:1: статуя, колесо колесницы, колонна | да, текста нет |
| `docs/assets/helioz-flow.png` | схема такта 16:9 с восемью английскими подписями и золотым возвратом от совета к очереди | да, все восемь подписей верны |

Перегенерация — теми же промптами выше; hero подавать вторым якорем (`-i`), чтобы набор оставался одной семьёй.
