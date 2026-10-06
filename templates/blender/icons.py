# -*- coding: utf-8 -*-
"""
Набор предметов-значков одной сценой: по кадру на вариант и лист превью одним прогоном (образец для blender.mjs).

    node blender.mjs render templates/blender/icons.py --variant pack,form,invoice,calc,box --out out --bg EFEBE4 --trim
    node blender.mjs render templates/blender/icons.py --variant pack-stand --out out --bg EFEBE4 --trim
    node blender.mjs render templates/blender/icons.py --variant seed,seeds,leaf,hex --out out --w 600 --h 600 --samples 32

Варианты: pack — пакет семян с этикеткой (наклонён, для первого экрана и плиток); pack-stand — он же стоит прямо,
с тенью на земле; form — заявка на планшете; invoice — счёт с печатью и монетой; calc — калькулятор с числом на
экране; box — коробка к отгрузке; мелочь для полей страницы: seed — семя, seeds — три семени, leaf — лист,
hex — ячейка сот с мёдом.
Цвета (--palette): accent — главный цвет дела, accent2 — тёмный, accent3 — светлый, kraft и kraft2 — картон,
paper — бумага, line — строки на бумаге, honey — мёд и монета, bark — семя, screen — экран, digits — цифры.

Это образец магазина семян: на сайт клиента предметы не переносить — писать свои по этому устройству. Что здесь
от планки: матовая бумага и картон с волокном рядом с лаком; металл зажима; детали, по которым вещь узнают
(заваренный верх пакета с гофрой, зубчатый низ счёта, гурт монеты, скотч и клапаны коробки, число на экране);
этикетка — печать картинкой (ctx.printed, label.png рядом; своя — из SVG через sharp), число — объёмной надписью.
Вещи собраны лёжа (плоскость XY, лицом вверх) и поставлены к камере ctx.stand.
"""
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
VARIANTS = ("pack", "pack-stand", "form", "invoice", "calc", "box", "seed", "seeds", "leaf", "hex")


def build(ctx):
    v = ctx.variant or "pack"
    if v not in VARIANTS:
        raise ValueError("вариант «%s»: есть %s" % (v, ", ".join(VARIANTS)))
    ctx.palette(accent="#58A423", accent2="#2F7A1A", accent3="#A4E23C", kraft="#D6B585", kraft2="#BC9763", paper="#FFFDF8",
                line="#CFE5AC", honey="#F0A92B", bark="#7A5A38", screen="#12301C", digits="#D3F34A")
    out = {"view": (0.0, -1.0, 0.12), "fov": 24}
    if v == "pack":
        ctx.stand(pack(ctx), tilt=(3, -26, 7))
    elif v == "pack-stand":
        ctx.stand(pack(ctx), tilt=(0, -21, 0))
        out = {"view": (0.0, -1.0, 0.2), "fov": 24, "ground": True}
    elif v == "form":
        ctx.stand(form(ctx), tilt=(-7, 24, -6))
    elif v == "invoice":
        ctx.stand(invoice(ctx), tilt=(-6, 22, 5))
    elif v == "calc":
        ctx.stand(calc(ctx), tilt=(-9, -24, 6))
    elif v == "box":
        ctx.stand(carton(ctx), tilt=(18, -36, 0))
    elif v == "seed":
        ctx.stand(seed(ctx, 1.4), tilt=(17, -23, 29))
        out["view"] = (0.0, -1.0, 0.2)
    elif v == "seeds":
        objs = ctx.group(seed(ctx, 1.2), rotation=(11, -17, 26))
        objs += ctx.group(seed(ctx, 0.95, "#8A6A42"), location=(1.5, -0.5, 0.3), rotation=(-11, 34, -40))
        objs += ctx.group(seed(ctx, 0.8, "#6C4E30"), location=(0.5, -1.25, -0.1), rotation=(29, 11, 92))
        ctx.stand(objs)
        out["view"] = (0.0, -1.0, 0.25)
    elif v == "leaf":
        objs = [ctx.leaf(2.6, 1.5, 0.26, curl=0.2, fold=0.2, tip=0.5, veins=10, twist=0.25, material=ctx.leafy("accent", depth=0.1), location=(-1.2, 0, 0), rotation=(0, -8, 28), name="leaf"),
                ctx.tube([(-1.9, -0.55, 0.1), (-1.5, -0.2, 0.02), (-1.2, 0, 0)], 0.06, material=ctx.gloss("accent3"), segments=20, radial=12, name="leaf-stalk")]
        ctx.stand(objs, tilt=(-25, 0, 0))
        out["view"] = (0.0, -1.0, 0.2)
    elif v == "hex":
        ctx.stand(cell(ctx), tilt=(-17, 29, 11))
        out["view"] = (0.0, -1.0, 0.05)
    return out


def bar(ctx, w, h, mat, pos, d=0.06):
    """Строка-плашка со скруглёнными концами: текст на бумаге, сумма, кнопка."""
    return ctx.card(w, h, d, corner=h / 2, material=mat, location=pos, name="bar", segments=6)


def seed(ctx, scale=1.0, color="bark"):
    """Семя: вытянутый эллипсоид с острым концом, лакированная оболочка, светлый рубчик."""
    body = ctx.sphere(0.5, material=ctx.gloss(color, roughness=0.3, coat=0.8), name="seed", segments=48)
    ctx.deform(body, lambda x, y, z: (x * 1.5, y * 0.92 * (1 - 0.22 * (x + 0.5)), z * 0.8))
    hilum = ctx.sphere(0.09, material=ctx.clay("#EADDBD"), location=(-0.7, 0.02, 0.16), name="seed-hilum", segments=20)
    hilum.scale = (1.3, 0.8, 0.7)
    return ctx.group([body, hilum], scale=scale)


def pack(ctx):
    """Пакет семян: крафтовое саше — пухлое тело, заваренный верх с гофрой, этикетка с печатью и знаком-ростком."""
    kraft, kraft2 = ctx.paper("kraft"), ctx.paper("kraft2")
    body = ctx.box((1.9, 2.5, 0.72), bevel=0.2, material=kraft, name="pack-body", subdiv=14)

    def puff(x, y, z):
        f = 1 + 0.2 * math.cos((y / 1.25) * math.pi / 2) - 0.36 * max(0.0, (y - 0.5) / 0.75)   # пухлее в середине, сплющен кверху
        f *= 1 - 0.1 * (abs(x) / 0.95) ** 6                                                    # боковая складка втянута
        return (x, y, z * f)
    ctx.deform(body, puff)
    objs = [body, ctx.box((2.0, 0.44, 0.26), bevel=0.1, material=kraft2, location=(0, 1.22, 0), name="pack-seal")]
    for i in range(7):   # гофра заваренного верха
        objs.append(ctx.cylinder(0.022, 1.86, bevel=0.0, segments=10, material=kraft, location=(0, 1.06 + i * 0.054, 0.132), rotation=(0, 90, 0), name="pack-crimp"))
    objs.append(ctx.torus(0.07, 0.02, material=kraft2, location=(0, 1.3, 0.14), name="pack-hole", seg_major=28, seg_minor=10))
    # этикетка: молочная бумага и печать поверх неё (рамка и надписи — картинкой), знак-росток — объёмный
    objs.append(ctx.card(1.4, 1.26, 0.07, corner=0.2, material=ctx.paper("paper", grain=0.6), location=(0, -0.28, 0.42), name="pack-label"))
    objs.append(ctx.plane((1.26, 1.12), material=ctx.printed(os.path.join(HERE, "label.png"), "paper"), location=(0, -0.28, 0.458), name="pack-print"))
    objs.append(ctx.leaf(0.56, 0.4, 0.1, curl=0.05, fold=0.1, veins=6, material=ctx.leafy("accent", depth=0.04), location=(0, -0.3, 0.5), rotation=(0, -8, 54), name="pack-leaf"))
    objs.append(ctx.leaf(0.46, 0.34, 0.1, curl=0.05, fold=0.1, veins=6, material=ctx.leafy("accent3", depth=0.04), location=(0, -0.3, 0.5), rotation=(0, -8, 137), name="pack-leaf"))
    objs.append(ctx.tube([(0, -0.52, 0.5), (0, -0.3, 0.5)], 0.032, material=ctx.gloss("accent2"), segments=8, radial=10, name="pack-stalk"))
    return objs


def form(ctx):
    """Заявка: планшет с листом, строками, отметками и галочкой; зажим металлический."""
    green, deep, line = ctx.gloss("accent"), ctx.gloss("accent2"), ctx.clay("line")
    steel = ctx.metal("#AAB3A4")
    milk = ctx.paper("paper", grain=0.6)
    objs = [ctx.card(2.0, 2.6, 0.18, corner=0.22, material=ctx.paper("kraft2"), name="form-board"),
            ctx.card(1.66, 2.16, 0.05, corner=0.12, material=milk, location=(0.02, -0.12, 0.11), rotation=(0, 0, -0.7), name="form-sheet"),   # нижний лист чуть сдвинут
            ctx.card(1.66, 2.16, 0.05, corner=0.12, material=milk, location=(0, -0.1, 0.15), name="form-sheet"),
            ctx.card(0.9, 0.36, 0.2, corner=0.14, material=steel, location=(0, 1.2, 0.12), name="form-clip"),
            ctx.torus(0.16, 0.035, material=steel, location=(0, 1.36, 0.14), name="form-clip-ring", seg_major=32, seg_minor=12)]
    for i in range(3):
        y = 0.42 - i * 0.48
        objs.append(bar(ctx, 0.6 if i == 2 else 0.86, 0.13, line, (0.22 - (0.13 if i == 2 else 0), y, 0.21)))
        objs.append(bar(ctx, 0.4 if i == 1 else 0.56, 0.07, ctx.clay("#E3EBCF"), (0.07 - (0.08 if i == 1 else 0), y - 0.16, 0.2), 0.03))
        dot = ctx.sphere(0.11, material=green if i < 2 else line, location=(-0.52, y, 0.21), name="form-dot", segments=28)
        dot.scale = (1, 1, 0.45)
        objs.append(dot)
    objs.append(ctx.cylinder(0.42, 0.14, bevel=0.03, material=green, location=(0.62, -0.92, 0.32), name="form-ok"))
    objs.append(ctx.torus(0.4, 0.035, material=deep, location=(0.62, -0.92, 0.38), name="form-ok-rim", seg_major=64, seg_minor=12))
    objs.append(ctx.tube([(0.44, -0.92, 0.42), (0.57, -1.06, 0.42), (0.82, -0.76, 0.42)], 0.055, material=ctx.gloss("paper"), segments=24, radial=14, name="form-check"))
    return objs


def invoice(ctx):
    """Счёт: лист с зубчатым низом, шапка, строки, столбец сумм, круглая печать и монета с гуртом."""
    green, deep, line = ctx.gloss("accent"), ctx.gloss("accent2"), ctx.clay("line")
    w, h, teeth = 1.7, 2.4, 7
    tw = w / teeth
    outline = [(w / 2, -h / 2 + 0.16)]
    for i in range(teeth):
        x = w / 2 - i * tw
        outline += [(x - tw / 2, -h / 2), (x - tw, -h / 2 + 0.16)]
    outline += [(-w / 2, h / 2), (w / 2, h / 2)]
    objs = [ctx.prism(outline, 0.1, bevel=0.02, material=ctx.paper("paper", grain=0.6), name="invoice-sheet"),
            bar(ctx, 0.74, 0.16, deep, (-0.3, 0.92, 0.09))]                         # шапка счёта
    for i in range(4):
        objs.append(bar(ctx, 0.72 if i % 2 else 1.1, 0.1, line, (-0.3 + (-0.19 if i % 2 else 0), 0.56 - i * 0.3, 0.085)))
        objs.append(bar(ctx, 0.22, 0.1, ctx.clay("#E3EBCF"), (0.6, 0.56 - i * 0.3, 0.085)))   # столбец сумм
    objs.append(bar(ctx, 0.5, 0.16, green, (0.46, -0.72, 0.09)))                    # «итого»
    for major, minor in ((0.34, 0.05), (0.2, 0.03)):                                # печать
        objs.append(ctx.torus(major, minor, material=deep, location=(-0.42, -0.74, 0.1), name="invoice-stamp", seg_major=56, seg_minor=14))
    # монета: металл под лаком, два бортика и гурт из насечек
    gold = ctx.gloss("honey", roughness=0.22, metallic=0.6)
    rim = ctx.gloss("#C27A12", roughness=0.25, metallic=0.6)
    coin = [ctx.cylinder(0.5, 0.16, bevel=0.02, material=gold, name="coin")]
    coin.append(ctx.torus(0.46, 0.04, material=rim, location=(0, 0, 0.08), name="coin-rim", seg_major=72, seg_minor=12))
    coin.append(ctx.torus(0.3, 0.028, material=rim, location=(0, 0, 0.085), name="coin-rim", seg_major=56, seg_minor=12))
    for i in range(40):
        a = 360.0 * i / 40
        coin.append(ctx.box((0.03, 0.02, 0.16), bevel=0.004, material=rim, location=(0.5 * math.cos(math.radians(a)), 0.5 * math.sin(math.radians(a)), 0), rotation=(0, 0, a), name="coin-edge"))
    ctx.group(coin, rotation=(6, -29, 11))
    ctx.group(coin, location=(0.86, -1.0, 0.42))
    return objs + coin


def calc(ctx):
    """Калькулятор: корпус, тёмный экран с числом, клавиши с площадкой, одна медовая «итого»."""
    objs = [ctx.box((1.9, 2.5, 0.42), bevel=0.2, material=ctx.gloss("accent2", roughness=0.28), name="calc-body"),
            ctx.box((1.74, 2.34, 0.06), bevel=0.03, material=ctx.gloss("accent", roughness=0.3), location=(0, 0, 0.2), name="calc-face"),
            ctx.card(1.5, 0.62, 0.08, corner=0.12, material=ctx.gloss("screen", roughness=0.12), location=(0, 0.78, 0.25), name="calc-screen")]
    # число на экране — объёмная надпись, светится; встроенный шрифт Blender кириллицу знает, свой — font=путь.ttf
    objs.append(ctx.text("25 кг", size=0.4, depth=0.012, material=ctx.glow("digits", strength=1.6), location=(0.12, 0.78, 0.296), name="calc-digits"))
    key, key_top = ctx.gloss("paper", roughness=0.32), ctx.gloss("#FFFFFF", roughness=0.25)
    fn, fn_top = ctx.gloss("accent3", roughness=0.32), ctx.gloss("#C4F06A", roughness=0.25)
    total, total_top = ctx.gloss("honey", roughness=0.22, metallic=0.35), ctx.gloss("#F8D072")
    for r in range(4):
        for c in range(3):
            last = r == 3 and c == 2
            x, y = -0.5 + c * 0.5, 0.2 - r * 0.4
            objs.append(ctx.box((0.42, 0.31, 0.2), bevel=0.07, material=total if last else fn if r == 0 else key, location=(x, y, 0.28), name="calc-key"))
            objs.append(ctx.box((0.3, 0.2, 0.03), bevel=0.012, material=total_top if last else fn_top if r == 0 else key_top, location=(x, y + 0.01, 0.38), name="calc-key-top"))
    return objs


def carton(ctx):
    """Коробка к отгрузке: клапаны со щелью, скотч с бликом, этикетка, стрелки «верх». Собрана стоя на плоскости
    листа: «верх» коробки — +Y, передняя стенка — +Z."""
    kraft, kraft2, line = ctx.paper("kraft"), ctx.paper("kraft2"), ctx.clay("line")
    tape = ctx.gloss("accent", roughness=0.18)
    objs = [ctx.box((2.3, 1.7, 1.9), bevel=0.06, material=kraft, name="carton")]
    for sx in (-1, 1):   # два клапана со щелью между ними
        objs.append(ctx.box((1.14, 0.08, 1.92), bevel=0.02, material=kraft2, location=(sx * 0.585, 0.86, 0), name="carton-flap"))
    objs.append(ctx.box((0.46, 1.76, 1.94), bevel=0.02, material=tape, location=(0, 0.02, 0), name="carton-tape"))   # скотч вокруг
    objs.append(ctx.box((0.46, 0.1, 1.98), bevel=0.02, material=tape, location=(0, 0.87, 0), name="carton-tape"))
    objs.append(ctx.card(0.66, 0.46, 0.05, corner=0.07, material=ctx.paper("paper", grain=0.6), location=(0.74, -0.3, 0.96), name="carton-label"))
    objs += [bar(ctx, 0.4, 0.06, line, (0.72, -0.2, 1.0), 0.03), bar(ctx, 0.26, 0.06, line, (0.66, -0.33, 1.0), 0.03), bar(ctx, 0.34, 0.05, ctx.gloss("accent2"), (0.7, -0.44, 1.0), 0.03)]
    ink = ctx.clay("#A9824F")
    for dx in (-0.92, -0.66):   # значок «верх»: две стрелки на левой половине передней стенки
        objs.append(ctx.box((0.05, 0.3, 0.02), bevel=0.004, material=ink, location=(dx, -0.44, 0.955), name="carton-arrow"))
        objs.append(ctx.prism([(-0.1, -0.07), (0.1, -0.07), (0.0, 0.09)], 0.02, bevel=0.004, material=ink, location=(dx, -0.22, 0.955), name="carton-arrow"))
    return objs


def cell(ctx):
    """Ячейка сот с мёдом (гроздь — honeycomb.py)."""
    from studio import hex_points
    R, WALL, DEPTH = 1.0, 0.16, 0.7
    return [ctx.prism(hex_points(R, 0.16), DEPTH, hole=hex_points(R - WALL, 0.14), bevel=0.07, material=ctx.clay("#F8D072", roughness=0.4, coat=0.7), name="cell-wall"),
            ctx.prism(hex_points(R - WALL * 0.6, 0.14), 0.1, bevel=0.03, material=ctx.clay("#F2B94A"), location=(0, 0, -DEPTH / 2 + 0.05), name="cell-floor"),
            ctx.prism(hex_points(R - WALL - 0.01, 0.14), DEPTH * 0.86, bevel=0.09, material=ctx.honey("honey", depth=0.22), location=(0, 0, -DEPTH / 2 + 0.1 + DEPTH * 0.43), name="cell-honey")]
