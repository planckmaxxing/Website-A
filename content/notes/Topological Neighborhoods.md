---
title: Topological Neighborhoods
order: 1
---

Classical models of [[Emergent Order Without Control|collective motion]]—most notably the Vicsek model—assume a metric interaction radius $r_0$, where each agent aligns with all neighbors satisfying $\|\mathbf{x}_i - \mathbf{x}_j\| \le r_0$. Empirical field reconstructions of starling flocks (see [[Reading List]]) reveal a fundamentally different interaction graph: birds track a fixed topological count of $n_c \approx 6\text{--}7$ nearest neighbors regardless of physical separation.

$$
\mathcal{N}_i = \operatorname{arg\,min}_{|S| = n_c} \sum_{j \in S} \|\mathbf{x}_i - \mathbf{x}_j\|, \qquad n_c \approx 6\text{--}7
$$

Under metric coupling, a sudden predatory strike or shear gust that expands inter-bird spacing can fracture the flock into disconnected sub-clusters. Topological coupling is invariant under isotropic rescaling, preserving graph connectivity across rapid density compressions and dilations while supporting [[Scale-Free Correlations|scale-free correlations]].
