"use client";

/**
 * The verification scene for @decode/motion-api: a small DNS diagram whose
 * cards and arrows are composed RELATIONALLY (Row/Stack/Card/Arrow from
 * @decode/animation-api) and whose every motion is a verb landing on a
 * narration word. No coordinate or frame number appears anywhere in this file.
 */

import { AbsoluteFill, Arrow, Card, Label, Row, Stack } from "@decode/animation-api";
import { Choreography, Subject, useConnection } from "./index";
import type { ChoreographyVerb, WordTimestamp } from "./tsgb";

const NARRATION =
  "You ask for a name like example.com but the network needs a destination so a resolver connects the name to the address it stands for";

/** Mock word timings: even spacing, the shape Fish Audio produces for real. */
export const SAMPLE_WORDS: WordTimestamp[] = NARRATION.split(" ").map((word, index) => ({
  word,
  startInSeconds: index * 0.38,
  endInSeconds: index * 0.38 + 0.34,
}));

/** The script: verbs anchored to narration word indices — no frames, no easing. */
export const SAMPLE_SCRIPT: ChoreographyVerb[] = [
  { id: "v1", type: "appear", targetId: "name", atWordIndex: 3 },
  { id: "v2", type: "indicate", targetId: "name", atWordIndex: 6, durationInWords: 2 },
  { id: "v3", type: "appear", targetId: "address", atWordIndex: 11 },
  { id: "v4", type: "appear", targetId: "resolver", atWordIndex: 15 },
  { id: "v5", type: "connect", targetId: "name", secondaryTargetId: "resolver", atWordIndex: 16, durationInWords: 2 },
  { id: "v6", type: "connect", targetId: "resolver", secondaryTargetId: "address", atWordIndex: 19, durationInWords: 2 },
  { id: "v7", type: "dim", targetId: "moral", atWordIndex: 0 },
  { id: "v8", type: "appear", targetId: "moral", atWordIndex: 22 },
  { id: "v9", type: "indicate", targetId: "address", atWordIndex: 23, durationInWords: 2 },
];

export function DecodeSampleScene({
  script = SAMPLE_SCRIPT,
  words = SAMPLE_WORDS,
}: {
  script?: ChoreographyVerb[];
  words?: WordTimestamp[];
}) {
  return (
    <AbsoluteFill style={{ background: "transparent", overflow: "hidden" }}>
      <Choreography script={script} words={words} accent="#F2A47B">
        <DnsDiagram />
      </Choreography>
    </AbsoluteFill>
  );
}

function DnsDiagram() {
  const nameToResolver = useConnection("name", "resolver");
  const resolverToAddress = useConnection("resolver", "address");
  return (
    <Stack gap={96} align="center" justify="center" style={{ width: "100%", height: "100%" }}>
      <Row gap={48}>
        <Subject id="name">
          <Card>
            <Label text="example.com" size={34} weight={600} />
          </Card>
        </Subject>
        <Arrow progress={nameToResolver} color="#F2A47B" />
        <Subject id="resolver">
          <Card>
            <Label text="resolver" size={30} weight={600} />
          </Card>
        </Subject>
        <Arrow progress={resolverToAddress} color="#F2A47B" />
        <Subject id="address">
          <Card>
            <Label text="203.0.113.7" size={34} weight={600} />
          </Card>
        </Subject>
      </Row>
      <Subject id="moral">
        <Label
          text="names are for people — addresses are for the network"
          size={24}
          color="#8A8A86"
          maxWidth={720}
        />
      </Subject>
    </Stack>
  );
}
