package quota

import "strings"

// EvaluateStatusAndRecommendation calculates the lifecycle status and actionable
// guidance. The checks are exclusive and ordered by how much they constrain the
// operator: an active cooldown outranks a disabled credential, which outranks a
// transport error, which outranks window arithmetic, and only a credential that
// fails none of them is reported as idle.
func EvaluateStatusAndRecommendation(q *NormalizedQuota, nowMS int64) {
	if q.ActiveCooldown != nil && q.ActiveCooldown.IsActive && activeCooldownExpired(q.ActiveCooldown, nowMS) {
		q.ActiveCooldown.IsActive = false
	}
	if q.ActiveCooldown != nil && q.ActiveCooldown.IsActive {
		q.Status = "cooldown"
		reason := "CPA cooldown protection is active"
		if q.ActiveCooldown.Reason != "" {
			reason = q.ActiveCooldown.Reason
		}
		q.Recommendation = QuotaRecommendation{
			Status:   "cooldown",
			Priority: "high",
			Action:   "clear_cooldown",
			Reason:   reason,
		}
		return
	}

	if q.Disabled {
		q.Status = "idle"
		q.Recommendation = QuotaRecommendation{
			Status:   "idle",
			Priority: "none",
			Action:   "none",
			Reason:   "Credential disabled",
		}
		return
	}

	if q.Error != "" {
		errLower := strings.ToLower(q.Error)
		if looksLikeAuthFailure(errLower) {
			q.Status = "error"
			q.Recommendation = QuotaRecommendation{
				Status:   "needs_reauth",
				Priority: "critical",
				Action:   "reauth",
				Reason:   "Upstream authentication failed or the credential expired. Reconfigure the key or sign in again.",
			}
			return
		}

		// Non-auth transient error: keep stale status if preserved from previous snapshot
		if q.Status != "stale" {
			q.Status = "error"
		}
		q.Recommendation = QuotaRecommendation{
			Status:   "warning",
			Priority: "medium",
			Action:   "refresh",
			Reason:   "The upstream refresh timed out or returned an invalid response. The last snapshot is kept; try refreshing again.",
		}
		return
	}

	if len(q.Windows) > 0 {
		minRemaining := 100.0
		hasRemaining := false
		for _, w := range q.Windows {
			if w.RemainingPercent != nil {
				hasRemaining = true
				if *w.RemainingPercent < minRemaining {
					minRemaining = *w.RemainingPercent
				}
			}
		}

		if hasRemaining {
			hasCredits := q.ResetCredits != nil && q.ResetCredits.AvailableCount > 0

			if minRemaining <= 0 {
				q.Status = "exhausted"
				if hasCredits {
					q.Recommendation = QuotaRecommendation{
						Status:   "credits_available",
						Priority: "high",
						Action:   "redeem_credit",
						Reason:   "This window's quota is exhausted. A Codex reset credit is available; reset now to restore capacity.",
					}
				} else {
					q.Recommendation = QuotaRecommendation{
						Status:   "exhausted",
						Priority: "medium",
						Action:   "none",
						Reason:   "Quota exhausted. Wait for the window to reset or switch to another credential.",
					}
				}
				return
			}

			if minRemaining < 20 {
				q.Status = "warning"
				if hasCredits {
					q.Recommendation = QuotaRecommendation{
						Status:   "credits_available",
						Priority: "medium",
						Action:   "redeem_credit",
						Reason:   "Less than 20% of the quota remains. Reset credits are available.",
					}
				} else {
					q.Recommendation = QuotaRecommendation{
						Status:   "warning",
						Priority: "low",
						Action:   "none",
						Reason:   "Quota is running low (under 20% left). Watch usage.",
					}
				}
				return
			}

			q.Status = "healthy"
			q.Recommendation = QuotaRecommendation{
				Status:   "healthy",
				Priority: "none",
				Action:   "none",
				Reason:   "Quota is healthy and the service is running normally.",
			}
			return
		}
	}

	// A provider that answered without publishing a window is a different observation from a
	// credential nobody has read yet. The caller seeds the marker from the last reading, and it
	// survives here because the console would otherwise report the credential as never read and
	// invite the operator to repeat a read that just succeeded.
	if q.Status == QuotaStatusUnpublished {
		q.Status = QuotaStatusUnpublished
		q.Recommendation = QuotaRecommendation{
			Status:   QuotaStatusUnpublished,
			Priority: "low",
			Action:   "none",
			Reason:   "The upstream publishes no quota windows; the read itself succeeded.",
		}
		return
	}

	q.Status = "idle"
	q.Recommendation = QuotaRecommendation{
		Status:   "idle",
		Priority: "none",
		Action:   "refresh",
		Reason:   "No live quota data yet. Refresh to fetch the latest from upstream.",
	}
}

func looksLikeAuthFailure(text string) bool {
	for _, marker := range []string{
		"unauthorized",
		"forbidden",
		"invalid_api_key",
		"invalid api key",
		"authentication failed",
		"auth failed",
		"token expired",
		"credential expired",
	} {
		if strings.Contains(text, marker) {
			return true
		}
	}
	for _, token := range strings.FieldsFunc(text, func(r rune) bool {
		return !(r >= 'a' && r <= 'z') && !(r >= '0' && r <= '9')
	}) {
		if token == "401" || token == "403" {
			return true
		}
	}
	return false
}

func activeCooldownExpired(cooldown *ActiveCooldown, nowMS int64) bool {
	if cooldown == nil {
		return false
	}
	if cooldown.RecoverAtMS != nil || cooldown.RetryAtMS != nil {
		return (cooldown.RecoverAtMS == nil || *cooldown.RecoverAtMS <= nowMS) &&
			(cooldown.RetryAtMS == nil || *cooldown.RetryAtMS <= nowMS)
	}
	return false
}
