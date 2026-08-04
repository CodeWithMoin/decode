from ..schemas import ProductionBrief, ProductionIntent


class FakeProducer:
    identifier = "fixture-producer-v1"

    def generate(
        self, intent: ProductionIntent, source_count: int, source_bytes: int
    ) -> ProductionBrief:
        direction = (
            f" based on your direction: {intent.creative_brief}"
            if intent.creative_brief
            else ""
        )
        return ProductionBrief(
            title="Production Brief",
            summary=f"A sample educational treatment for {intent.audience}{direction}.",
            audience_profile=intent.audience,
            learning_objectives=[
                "Explain the source's central idea",
                "Connect the idea to a practical example",
            ],
            key_concepts=[
                {"name": "Central idea", "importance": "core"},
                {"name": "Practical context", "importance": "supporting"},
            ],
            prerequisites=["No specialist knowledge assumed"],
            scope_in=["Conceptual explanation", "One worked example"],
            scope_out=["Production-ready scene design", "Narration and rendering"],
            teaching_opportunities=[
                {
                    "title": "Concrete analogy",
                    "rationale": "Ground the central idea in a familiar situation.",
                }
            ],
            source_findings={
                "fixture": True,
                "source_count": source_count,
                "total_bytes": source_bytes,
                "note": (
                    "Metadata-only deterministic walking-skeleton findings; "
                    "no extraction was performed."
                ),
            },
            open_questions=[],
        )


class FakeEvaluator:
    identifier = "fixture-evaluator-v1"

    def evaluate(self, brief: ProductionBrief) -> tuple[str, list[dict], str]:
        checks = [
            {
                "name": "objectives_present",
                "outcome": "pass" if brief.learning_objectives else "fail",
                "evidence": "Learning objectives are present.",
            },
            {
                "name": "concepts_present",
                "outcome": "pass" if brief.key_concepts else "fail",
                "evidence": "Key concepts are present.",
            },
            {
                "name": "fixture_disclosed",
                "outcome": "pass" if brief.source_findings.get("fixture") is True else "fail",
                "evidence": "Fixture findings are explicitly labeled.",
            },
        ]
        decision = (
            "pass" if all(item["outcome"] == "pass" for item in checks) else "needs_attention"
        )
        return (
            decision,
            checks,
            "Structured fixture checks completed; human approval remains independent.",
        )
