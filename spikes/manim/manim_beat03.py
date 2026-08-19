from manim import *


class Beat03(Scene):
    def construct(self):
        self.camera.background_color = "#0B0B0B"

        surface = "#232323"
        border = "#484848"
        primary = "#F0F6F1"
        support = "#8A8A86"
        accent = "#F2A47B"

        title = Text(
            "DNS acts as the resolver",
            font_size=38,
            color=primary,
        ).to_edge(UP, buff=0.42)

        subtitle = Text(
            "a name is connected to the destination used to reach a website",
            font_size=18,
            color=support,
        ).next_to(title, DOWN, buff=0.18)

        self.play(FadeIn(title), FadeIn(subtitle), run_time=1.2)
        self.wait(0.8)

        left_card = RoundedRectangle(
            width=3.15,
            height=2.35,
            corner_radius=0.16,
            fill_color=surface,
            fill_opacity=1,
            stroke_color=border,
            stroke_width=2,
        ).move_to(LEFT * 4.15 + UP * 0.65)

        left_header = Text(
            "DOMAIN NAME",
            font_size=16,
            color=support,
        ).move_to(left_card.get_center() + UP * 0.62)

        domain = Text(
            "example.com",
            font_size=29,
            color=accent,
        ).move_to(left_card.get_center() + DOWN * 0.08)

        left_note = Text(
            "human-friendly label",
            font_size=15,
            color=support,
        ).move_to(left_card.get_center() + DOWN * 0.68)

        right_card = RoundedRectangle(
            width=3.15,
            height=2.35,
            corner_radius=0.16,
            fill_color=surface,
            fill_opacity=1,
            stroke_color=border,
            stroke_width=2,
        ).move_to(RIGHT * 4.15 + UP * 0.65)

        right_header = Text(
            "DESTINATION",
            font_size=16,
            color=support,
        ).move_to(right_card.get_center() + UP * 0.62)

        address = Text(
            "203.0.113.42",
            font_size=27,
            color=primary,
        ).move_to(right_card.get_center() + DOWN * 0.08)

        right_note = Text(
            "website endpoint",
            font_size=15,
            color=support,
        ).move_to(right_card.get_center() + DOWN * 0.68)

        self.play(
            Create(left_card),
            FadeIn(left_header),
            FadeIn(domain),
            FadeIn(left_note),
            Create(right_card),
            FadeIn(right_header),
            FadeIn(address),
            FadeIn(right_note),
            run_time=1.4,
        )
        self.wait(0.6)

        resolver_card = RoundedRectangle(
            width=2.35,
            height=2.35,
            corner_radius=0.16,
            fill_color=surface,
            fill_opacity=1,
            stroke_color=accent,
            stroke_width=2,
        ).move_to(UP * 0.65)

        resolver = Text(
            "DNS",
            font_size=36,
            color=accent,
        ).move_to(resolver_card.get_center() + UP * 0.25)

        resolver_note = Text(
            "resolver",
            font_size=18,
            color=primary,
        ).move_to(resolver_card.get_center() + DOWN * 0.42)

        self.play(
            Create(resolver_card),
            FadeIn(resolver),
            FadeIn(resolver_note),
            run_time=1.0,
        )
        self.wait(1.0)

        left_arrow = Arrow(
            left_card.get_right() + RIGHT * 0.08,
            resolver_card.get_left() + LEFT * 0.08,
            buff=0,
            stroke_color=accent,
            stroke_width=4,
            max_tip_length_to_length_ratio=0.22,
        )

        right_arrow = Arrow(
            resolver_card.get_right() + RIGHT * 0.08,
            right_card.get_left() + LEFT * 0.08,
            buff=0,
            stroke_color=accent,
            stroke_width=4,
            max_tip_length_to_length_ratio=0.22,
        )

        lookup_label = Text(
            "LOOK UP",
            font_size=14,
            color=accent,
        ).move_to(UP * 1.95)

        self.play(
            GrowArrow(left_arrow),
            GrowArrow(right_arrow),
            FadeIn(lookup_label),
            run_time=1.2,
        )
        self.wait(0.8)

        signal = Dot(
            point=left_arrow.get_start(),
            radius=0.09,
            color=accent,
        )
        self.play(FadeIn(signal), run_time=0.2)
        self.play(signal.animate.move_to(left_arrow.get_end()), run_time=0.45)
        self.play(signal.animate.move_to(right_arrow.get_start()), run_time=0.45)
        self.play(signal.animate.move_to(right_arrow.get_end()), run_time=0.4)
        self.wait(0.5)

        translate_box = RoundedRectangle(
            width=2.45,
            height=0.52,
            corner_radius=0.12,
            fill_color=surface,
            fill_opacity=1,
            stroke_color=border,
            stroke_width=1.5,
        ).move_to(DOWN * 0.82)

        translate_text = Text(
            "NAME  →  ADDRESS",
            font_size=16,
            color=primary,
        ).move_to(translate_box.get_center())

        self.play(Create(translate_box), FadeIn(translate_text), run_time=1.0)
        self.wait(1.0)

        lower_panel = RoundedRectangle(
            width=11.4,
            height=1.55,
            corner_radius=0.16,
            fill_color=surface,
            fill_opacity=1,
            stroke_color=border,
            stroke_width=2,
        ).move_to(DOWN * 2.25)

        people_label = Text(
            "PEOPLE",
            font_size=16,
            color=support,
        ).move_to(LEFT * 3.8 + DOWN * 1.95)

        people_text = Text(
            "remember names",
            font_size=24,
            color=primary,
        ).move_to(LEFT * 3.8 + DOWN * 2.35)

        network_label = Text(
            "NETWORK",
            font_size=16,
            color=support,
        ).move_to(RIGHT * 3.8 + DOWN * 1.95)

        network_text = Text(
            "uses destinations",
            font_size=24,
            color=primary,
        ).move_to(RIGHT * 3.8 + DOWN * 2.35)

        divider = Line(
            DOWN * 1.72,
            DOWN * 2.78,
            stroke_color=border,
            stroke_width=2,
        )

        self.play(
            Create(lower_panel),
            FadeIn(people_label),
            FadeIn(people_text),
            FadeIn(network_label),
            FadeIn(network_text),
            Create(divider),
            run_time=1.4,
        )
        self.wait(0.6)

        result_text = Text(
            "DNS resolves the name into information the network can use",
            font_size=21,
            color=primary,
        ).move_to(DOWN * 3.28)

        result_rule = Line(
            LEFT * 3.25 + DOWN * 3.02,
            RIGHT * 3.25 + DOWN * 3.02,
            stroke_color=accent,
            stroke_width=3,
        )

        self.play(FadeIn(result_text), Create(result_rule), run_time=1.0)
        self.wait(1.0)

        route_text = Text(
            "the website can be reached",
            font_size=18,
            color=support,
        ).move_to(DOWN * 3.68)

        self.play(FadeIn(route_text), run_time=1.2)
        self.wait(0.8)

        takeaway = Text(
            "Remember the name. DNS handles the destination.",
            font_size=25,
            color=accent,
        ).move_to(DOWN * 3.68)

        self.play(Transform(route_text, takeaway), run_time=1.2)
        self.wait(2.8)

        final_accent = Line(
            LEFT * 2.4 + DOWN * 3.98,
            RIGHT * 2.4 + DOWN * 3.98,
            stroke_color=accent,
            stroke_width=2,
        )

        self.play(Create(final_accent), run_time=0.8)
        self.wait(1.2)
