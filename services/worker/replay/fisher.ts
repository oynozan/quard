// log of "n choose k"
function logChoose(n: number, k: number): number {
    let sum = 0;
    for (let i = 1; i <= k; i++) {
        sum += Math.log(n - k + i) - Math.log(i);
    }
    return sum;
}

// One-sided Fisher exact test: how likely at least `harmfulWith` harmful reruns
// with the content would be if harm were just as common without it
export function fisherOneSided(
    harmfulWith: number,
    runsWith: number,
    harmfulWithout: number,
    runsWithout: number,
): number {
    const harmful = harmfulWith + harmfulWithout;
    const total = runsWith + runsWithout;
    let p = 0;
    for (let x = harmfulWith; x <= Math.min(harmful, runsWith); x++) {
        p += Math.exp(logChoose(runsWith, x) + logChoose(runsWithout, harmful - x) - logChoose(total, harmful));
    }
    return Math.min(1, p);
}
