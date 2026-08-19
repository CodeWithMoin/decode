from manim import *


class Beat02(Scene):
    def make_card(self, x, y, width, height, label, label_size=28,
                  border="#484848", fill="#232323", text_color="#F0F6F1"):
        box = RoundedRectangle(
            width=width,
            height=height,
            corner_radius=0.16,
            stroke_color=border,
            stroke_width=2,
            fill_color=fill,
            fill_opacity=1,
        ).move_to([x, y, 0])
        text = Text(label, font_size=label_size, color=text_color).move_to(box)
        return box, text

    def construct(self):
        self.camera.background_color = "#0B0B0B"

        primary = "#F0F6F1"
        support = "#8A8A86"
        surface = "#232323"
        border = "#484848"
        accent = "#F2A47B"

        title = Text(
            "Connections need a destination",
            font_size=34,
            color=primary,
        ).to_edge(UP, buff=0.38)

        subtitle = Text(
            "A name is not yet a route",
            font_size=21,
            color=support,
        ).next_to(title, DOWN, buff=0.16)

        self.play(Write(title), run_time=0.8)
        self.play(Write(subtitle), run_time=0.7)
        self.wait(0.5)

        name_box, name_text = self.make_card(
            -4.15, 1.15, 3.25, 1.15, "example.com", 29,
            border=accent,
        )
        name_caption = Text(
            "MEMORABLE NAME",
            font_size=16,
            color=support,
        ).next_to(name_box, DOWN, buff=0.16)

        self.play(Create(name_box), Write(name_text), run_time=1.2)
        self.play(Write(name_caption), run_time=0.5)
        self.wait(0.5)

        network_box = RoundedRectangle(
            width=10.8,
            height=1.18,
            corner_radius=0.16,
            stroke_color=border,
            stroke_width=2,
            fill_color=surface,
            fill_opacity=1,
        ).move_to([0, -1.25, 0])

        network_label = Text(
            "NETWORK",
            font_size=21,
            color=primary,
        ).move_to(network_box.get_left() + RIGHT * 1.0)

        network_detail = Text(
            "needs a routable destination",
            font_size=19,
            color=support,
        ).move_to(network_box.get_center() + RIGHT * 1.25)

        self.play(Create(network_box), run_time=0.7)
        self.play(Write(network_label), Write(network_detail), run_time=0.6)

        failed_arrow = Arrow(
            name_box.get_bottom() + DOWN * 0.08,
            network_box.get_top() + LEFT * 3.4,
            buff=0.12,
            stroke_width=4,
            color=accent,
            max_tip_length_to_length_ratio=0.16,
        )

        cross_a = Line(
            [-2.72, -0.08, 0],
            [-2.35, 0.29, 0],
            stroke_width=5,
            color=accent,
        )
        cross_b = Line(
            [-2.35, -0.08, 0],
            [-2.72, 0.29, 0],
            stroke_width=5,
            color=accent,
        )

        no_destination = Text(
            "no destination",
            font_size=18,
            color=accent,
        ).next_to(failed_arrow, DOWN, buff=0.1)

        self.play(GrowArrow(failed_arrow), run_time=0.7)
        self.play(Create(cross_a), Create(cross_b), run_time=0.4)
        self.play(Write(no_destination), run_time=0.6)
        self.wait(0.4)

        resolver_box, resolver_text = self.make_card(
            0, 1.15, 2.55, 1.15, "RESOLVER", 25,
            border=accent,
        )
        resolver_detail = Text(
            "find the destination",
            font_size=16,
            color=support,
        ).next_to(resolver_box, DOWN, buff=0.16)

        self.play(Create(resolver_box), Write(resolver_text), run_time=0.7)
        self.play(Write(resolver_detail), run_time=0.5)

        lookup_arrow = Arrow(
            name_box.get_right() + RIGHT * 0.08,
            resolver_box.get_left() + LEFT * 0.08,
            buff=0.14,
            stroke_width=4,
            color=accent,
            max_tip_length_to_length_ratio=0.16,
        )
        lookup_label = Text(
            "LOOK UP",
            font_size=16,
            color=support,
        ).next_to(lookup_arrow, UP, buff=0.1)

        self.play(GrowArrow(lookup_arrow), run_time=0.7)
        self.play(Write(lookup_label), run_time=0.5)

        destination_box, destination_text = self.make_card(
            4.15, 1.15, 3.45, 1.15, "93.184.216.34", 27,
            border=accent,
        )
        destination_caption = Text(
            "DESTINATION",
            font_size=16,
            color=support,
        ).next_to(destination_box, DOWN, buff=0.16)

        self.play(Create(destination_box), Write(destination_text), run_time=0.7)
        self.play(Write(destination_caption), run_time=0.6)

        route_arrow = Arrow(
            resolver_box.get_right() + RIGHT * 0.08,
            destination_box.get_left() + LEFT * 0.08,
            buff=0.14,
            stroke_width=4,
            color=accent,
            max_tip_length_to_length_ratio=0.16,
        )
        route_label = Text(
            "ASSOCIATE",
            font_size=16,
            color=support,
        ).next_to(route_arrow, UP, buff=0.1)

        self.play(GrowArrow(route_arrow), run_time=0.7)
        self.play(Write(route_label), run_time=0.6)
        self.wait(0.4)

        request_box = RoundedRectangle(
            width=10.8,
            height=1.08,
            corner_radius=0.16,
            stroke_color=border,
            stroke_width=2,
            fill_color=surface,
            fill_opacity=1,
        ).move_to([0, -2.82, 0])

        request_label = Text(
            "ACTIONABLE REQUEST",
            font_size=19,
            color=primary,
        ).move_to(request_box.get_left() + RIGHT * 1.35)

        self.play(Create(request_box), run_time=0.7)
        self.play(Write(request_label), run_time=0.5)

        name_chip, name_chip_text = self.make_card(
            -1.45, -2.82, 1.55, 0.64, "name", 20,
            border=border,
        )
        destination_chip, destination_chip_text = self.make_card(
            0.85, -2.82, 2.25, 0.64, "destination", 20,
            border=accent,
        )

        chip_arrow = Arrow(
            name_chip.get_right(),
            destination_chip.get_left(),
            buff=0.12,
            stroke_width=3,
            color=accent,
            max_tip_length_to_length_ratio=0.22,
        )

        self.play(Create(name_chip), Write(name_chip_text), run_time=0.5)
        self.play(GrowArrow(chip_arrow), run_time=0.5)
        self.play(
            Create(destination_chip),
            Write(destination_chip_text),
            run_time=0.5,
        )

        down_arrow = Arrow(
            destination_box.get_bottom() + DOWN * 0.08,
            network_box.get_top() + RIGHT * 3.2,
            buff=0.12,
            stroke_width=4,
            color=accent,
            max_tip_length_to_length_ratio=0.16,
        )

        self.play(GrowArrow(down_arrow), run_time=0.7)

        direct_label = Text(
            "DIRECT CONNECTION",
            font_size=18,
            color=accent,
        ).next_to(network_box, DOWN, buff=0.13)

        self.play(Write(direct_label), run_time=0.6)
        self.wait(0.5)

        self.play(
            failed_arrow.animate.set_opacity(0.25),
            cross_a.animate.set_opacity(0.25),
            cross_b.animate.set_opacity(0.25),
            no_destination.animate.set_opacity(0.35),
            run_time=0.5,
        )

        meaning = Text(
            "what you want  →  where to go",
            font_size=22,
            color=primary,
        ).move_to([0, -4.0, 0])

        self.play(Write(meaning), run_time=0.8)

        final_arrow = Arrow(
            request_box.get_right() + LEFT * 0.6,
            network_box.get_right() + LEFT * 0.6,
            buff=0.12,
            stroke_width=3,
            color=accent,
            max_tip_length_to_length_ratio=0.16,
        )

        self.play(GrowArrow(final_arrow), run_time=0.8)

        acts = Text(
            "NOW THE NETWORK CAN ACT",
            font_size=22,
            color=accent,
        ).next_to(final_arrow, RIGHT, buff=0.18)

        self.play(Write(acts), run_time=0.7)
        self.wait(5.1)
