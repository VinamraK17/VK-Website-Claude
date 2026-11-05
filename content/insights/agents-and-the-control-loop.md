---
title: Agents need a control loop
date: 2026-11-03
issue: 1
summary: Operations leaders usually ask how much an AI agent can do. A better first question is how quickly you can see what it does and stop it.
linkedin: https://www.linkedin.com/pulse/agents-need-control-loop-vinamra-kumar-7vque/
---

## Control needs two things

Control theory has a plain requirement. To regulate a system, a controller must be able to sense what the system is doing and act on it, and the action must arrive quickly relative to how fast the system changes. Remove either and you are running open-loop, whatever the programme slides say.

Apply that to an operations agent. Sensing means knowing which agents exist and on which data they made their decisions. Acting means being able to pause, constrain, roll back or switch one off. Most of the debate about agents is about the quality of their decisions. That matters. In my view, though, a decision-maker with a good average and no brakes is still an uncontrolled component in a system that has customers and colleagues in it.

Air traffic control gives the cleanest picture of the two halves. A controller who sees a conflict developing but has no radio to reach the aircraft has a fine display and no control. Many agent deployments will have the reverse problem, a working radio and a poor picture.

When I worked as an air traffic controller at one of the busiest airports in India, the moment I trusted least was the handover, because once the aircraft switched frequency, I had no way to reach it until the pilot checked in with the next controller.

## Why agents strain the loop

Traditional automation was narrow. A script did one thing on a schedule, and its failure modes were few enough to list on a page. An agent chooses between actions at runtime, calls other systems, and can be created by anyone with the right access. W. Ross Ashby's law of requisite variety, set out in his 1956 book *An Introduction to Cybernetics*, says a regulator can only absorb as much variety as it has itself. If the agent population grows faster than your ability to observe and intervene, control degrades even when every individual agent is well built.

Speed matters as much as number. An agent acts in seconds and a weekly review corrects in days. A correction that arrives after the damage is done is a post-mortem. It is useful, but it is not control.

## Grant autonomy by reversibility

I'd argue that autonomy should be granted in proportion to how reversible an action is and how quickly you would detect a problem, and not in proportion to accuracy in testing. An agent that drafts a customer reply for a person to send is reversible by construction. An agent that changes configuration affecting many customers at once is not, unless someone has built and rehearsed the way back.

Before an agent goes live I would want to know who can stop it and how long that takes. Every agent also needs a named human owner who can do so without convening a committee.

## Regulation points the same way

The EU's AI Omnibus (Regulation (EU) 2026/1744, in force since 27 July 2026) moved the high-risk obligations of the AI Act to 2 December 2027 for stand-alone systems and 2 August 2028 for those embedded in regulated products, according to [White & Case's summary](https://www.whitecase.com/insight-alert/eu-ai-omnibus-enters-force-amending-ai-act). Extra time is not a change of direction. [Article 12](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-12) requires high-risk systems to allow automatic logging, and [Article 14](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-14) requires that overseers can intervene or interrupt the system through a "stop" button or similar procedure. A working control loop provides both, and I would spend the extra months building it.

A useful test for the next quarterly review is to pick one live agent and ask its owner to stop it, with a stopwatch running. The time it takes is a better measure of your control than any maturity score.

---

## On the radar

In September 2026 Guild.ai, which sells agent-management software, published a survey it commissioned from Morning Consult. It covers 362 US IT decision-makers at companies with 100 or more employees, fielded 4 to 9 August 2026, with a margin of error of ±5 percentage points. Treat it as a sponsor's survey, self-reported, US-only and from a company that sells in this space.

Even so, two figures are worth holding side by side, because they measure the same thing at two speeds. 31% said they can stop a malfunctioning agent immediately with an automated kill switch, and 76.5% said they can stop one within minutes once manual responses are counted. The release also reports that 66.7% of organisations with agents had an agent-related operational consequence in the past 12 months.

For someone running AI in operations, the useful reading is the window between "immediately" and "within minutes", which is where an incident grows. Your own measured time-to-stop for each agent will tell you more than any survey, this one included.

Source: [Guild.ai, "The AI Agent Management Gap Is Growing", GlobeNewswire, 22 September 2026](https://www.globenewswire.com/news-release/2026/09/22/3366611/0/en/the-ai-agent-management-gap-is-growing.html)

---

## From the logbook

In my early years, I was a tower controller at New Delhi airport, responsible for departures and arrivals.

One morning shift, a helicopter flying under visual flight rules came in from the north without contacting me on the tower frequency. Nobody had told me it had been handed over, and it stayed silent for several minutes. Then it crossed the landing runway, just above an arriving aircraft. I could see exactly what was happening in front of me, and I could not control it. I could only act once the helicopter finally called on tower frequency.

That gap, between having the right information and getting the handover at the right time, meant I had to report it as an incident.

What I took from it: seeing a problem is not the same as controlling it. Control lives in the channel and the handover, and a system is only as safe as the moment nobody can reach it.

I still ask the same question of every automated system I work with: if it does something unexpected right now, who can reach it, and how fast?
