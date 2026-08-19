# What A Gate Failure Usually Is

Opened when a gate fails, when a таск comes back wrong, or when something is
about to be explained away. Not read through — found in, and closed.

Nothing here is a rule. The rules are in `SKILL.md` and in the phase files. This
is the list of ways a прогон goes wrong while every individual step still looks
reasonable, which is the only way a прогон with four gates on it goes wrong at
all.

## Excuses

Each of these is a sentence that ends an investigation one step early. The
sentence is often true. What makes it an excuse is that it is offered *instead
of* the fact underneath it.

| The sentence | What it usually means | What to do instead |
|---|---|---|
| "The требование was ambiguous, so I built the narrower reading." | A decision about scope was made by whoever was least equipped to make it, and nothing recorded that it happened. | Build the reading you can defend, and put the other one in the отчёт under Assumptions. Ambiguity is reported, never silently resolved. |
| "The test is flaky." | The test is failing and nobody has looked at why. | Run it three times and say what happened each time. A test that fails once in three is a finding about the build, not about the test. |
| "It works when I run it by hand." | The build depends on state the running build does not have. | That is the finding. Name the state. |
| "The reviewer misread the таск." | Either the task file is unclear or the finding is right. | Quote both, side by side. If the task file supports the finding, it is a finding. |
| "That is out of scope now." | Scope was decided at G3 and is being re-decided after the fact. | Scope changes are `S1`'s territory: only the user removes a требование, in their own words. |
| "It is a two-line fix, I will just do it." | `S5`. | Hand it to an executor. The прогон has no record of an edit made outside a таск, and the review that follows judges it as though it had. |
| "The gate is being pedantic." | The gate is measuring against the user's words and something else was built. | Read the finding against the требование it names. If it is genuinely wrong, it is wrong about a specific `R##`; say which. |
| "Nobody will notice." | A prediction about the user, offered instead of a fact about the build. | It goes in the отчёт. Deciding what the user will accept is the one judgement that is theirs. |

## Red Flags

Signals that something already went wrong, usually one phase earlier than where
it surfaced.

| The signal | What it usually is |
|---|---|
| A gate passes on the second attempt with no change to the build | The finding was reinterpreted rather than acted on. Re-read what changed between the two attempts; if it is only the wording of the answer, the gate has not passed. |
| A finding names no `R##` | It cannot be counted, routed or checked. It is an opinion until it names one — see the evidence rule in `docs/spec/gates.md`. |
| Every таск leaves a handoff | The cut was too large. The handoff exists for surprises; a plan producing one per таск is a plan to re-cut. |
| A wave merged with conflicts | Two таски owned the same file. That is a defect in the cut, not a merge to resolve. |
| A требование moved to `deferred` and no answer records the user agreeing | `S1`. Restore it and ask. |
| The отчёт's Assumptions section is empty | Possible, and rare. Check it against `S3`: every placeholder standing in for a fact nobody supplied belongs there, and a run that invented nothing usually still assumed something. |
| A таск finished far faster than the others in its wave | Either it was cut too small or it did less than it says. Read its diff against its *done means* before believing either. |
| The same difference survives three доводка rounds | Three executors failed at one visible thing. Report it; a fourth attempt hides the pattern. |
| A phase produced an artifact another phase was supposed to write | Two writers on one file. Find which phase wrote it and why — the first disagreement between them will be unattributable. |

## The One Question Underneath All Of Them

**What would this look like if it were the other thing?**

An ambiguous требование and a scope decision look identical from inside the
decision. A flaky test and a race condition look identical from one run. An
excuse and an accurate report look identical until somebody asks for the fact
underneath. The question above is what separates them, and it costs one
paragraph.
