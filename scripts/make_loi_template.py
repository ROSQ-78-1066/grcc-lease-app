"""Builds templates/LOI_Template.docx: the app's non-binding Letter of Intent.
Uses the same merge tags as the lease templates (docxtemplater: {{X}}, {#X}..{/X}, {^X}..{/X}).
White (invisible) anchors \\s1\\ \\d1\\ (Tenant) and \\s2\\ \\d2\\ (Landlord) place signatures.
A copy can be edited in Egnyte at TEMPLATES/Tagged/LOI_Template.docx; the app uses that copy when present.
Usage: python3 scripts/make_loi_template.py templates/LOI_Template.docx
"""
import sys
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor, Inches

d = Document()
sec = d.sections[0]
sec.page_width, sec.page_height = Inches(8.5), Inches(11)
for side in ("left_margin", "right_margin", "top_margin", "bottom_margin"):
    setattr(sec, side, Inches(1))
st = d.styles["Normal"]
st.font.name = "Calibri"
st.font.size = Pt(11)
st.paragraph_format.space_after = Pt(6)
st.paragraph_format.line_spacing = 1.08


def para(*parts, align=None, space_after=None, indent=None):
    p = d.add_paragraph()
    if align:
        p.alignment = align
    if space_after is not None:
        p.paragraph_format.space_after = Pt(space_after)
    if indent:
        p.paragraph_format.left_indent = Inches(indent)
    for part in parts:
        if isinstance(part, tuple):
            text, fmt = part
        else:
            text, fmt = part, ""
        r = p.add_run(text)
        flags = fmt.split()
        r.bold = "b" in flags
        r.italic = "i" in flags
        if "w" in flags:
            r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        if "big" in flags:
            r.font.size = Pt(15)
    return p


n = [0]


def term(label, *body):
    n[0] += 1
    p = para((f"{n[0]}.\t{label}: ", "b"), *body, indent=0.35)
    p.paragraph_format.first_line_indent = Inches(-0.35)
    p.paragraph_format.tab_stops.add_tab_stop(Inches(0.35))
    return p


para(("LETTER OF INTENT", "b big"), align=WD_ALIGN_PARAGRAPH.CENTER, space_after=0)
para(("Non-Binding Proposal to Lease", "i"), align=WD_ALIGN_PARAGRAPH.CENTER, space_after=14)

para("Date: {{EFFECTIVE_DATE}}", space_after=0)
para("To: {{TENANT_LEGAL_NAME}}", space_after=0)
para("Attn: {{TENANT_SIGNER_NAME}}{#TENANT_EMAIL} ({{TENANT_EMAIL}}){/TENANT_EMAIL}", space_after=0)
para(("Re: ", "b"), ("Suite {{SUITE_NUMBER}}, {{BUILDING_STREET_NUMBER}} Roger B. Chaffee Memorial Blvd. SE, Wyoming, MI 49548", "b"), space_after=12)

para(
    "Bluewater Corporate Center, LLC (“Landlord”) is pleased to propose the following principal terms for a lease of the "
    "premises described below to {{TENANT_LEGAL_NAME}} (“Tenant”). This letter is a summary for discussion only; it is "
    "not a lease and is not binding on either party (see Section 16)."
)

term("Premises", "Suite {{SUITE_NUMBER}}, approximately {{RENTABLE_SQ_FT}} rentable square feet with {{LOADING_TEXT}}, "
     "representing Tenant’s Proportionate Share of {{PROPORTIONATE_SHARE}}% of the approximately 159,600 rentable square "
     "feet in the multi-tenant buildings at {{BUILDING_STREET_NUMBER}} Roger B. Chaffee Memorial Blvd. SE, Wyoming, MI 49548.")
term("Lease Form", "Landlord’s standard Commercial Triple Net (NNN) Lease Agreement ({{LEASE_FORM}}).")
term("Permitted Use", "{#IS_INDIVIDUAL_TENANT}{{SOLE_PROP_BUSINESS_TYPE}}, and otherwise {/IS_INDIVIDUAL_TENANT}Commercial, "
     "industrial, retail, or wholesale distribution purposes and uses incidental to them, as defined in the Lease.")
term("Term", "{{TERM_MONTHS_WORDS}} ({{TERM_MONTHS}}) months, commencing on {{COMMENCEMENT_DATE}} and ending on "
     "{{TERMINATION_DATE}}.")
term("Base Rent", "${{INITIAL_ANNUAL_RENT}} per year (${{INITIAL_MONTHLY_RENT}} per month) for the first year of the Term. "
     "{#ESC_MULTI}Base Rent increases by {{ESCALATION_RATE}}% each year on {{ANNIVERSARY_DATE}}, compounding.{/ESC_MULTI}"
     "{#ESC_ONE}Base Rent increases by {{ESCALATION_RATE}}% on {{FIRST_ESCALATION_DATE}}.{/ESC_ONE}"
     "{#ESC_NONE}Base Rent is fixed for the Term.{/ESC_NONE}")
term("Additional Rent (NNN)", "Tenant pays its Proportionate Share of real estate taxes, insurance, and property "
     "maintenance. For {{NNN_YEAR}} this is estimated at ${{NNN_RATE}} per square foot per year (${{ESTIMATED_MONTHLY_ADDITIONAL_RENT}} "
     "per month), paid monthly with Base Rent and reconciled annually.")
term("Total Initial Monthly Payment", "${{TOTAL_INITIAL_MONTHLY_PAYMENT}} per month (Base Rent plus estimated Additional Rent).")
term("Free Rent", "{#HAS_FREE_RENT}Base Rent for the {{FREE_RENT_MONTH_TEXT}} full calendar month of the Term "
     "({{FREE_RENT_MONTH_LABEL}}) is abated (${{ABATED_RENT}}). Additional Rent remains due. The abatement is conditional: "
     "it becomes payable if Tenant defaults or does not keep automatic payment in place, as set out in the Lease."
     "{/HAS_FREE_RENT}{^HAS_FREE_RENT}None.{/HAS_FREE_RENT}")
term("Security Deposit", "${{SECURITY_DEPOSIT}}, due when the Lease is signed.")
term("Due Before Possession", "${{TOTAL_DUE_BEFORE_POSSESSION}} in cleared funds before keys are delivered: the Security "
     "Deposit and the Rent for the first full calendar month{#IS_MID_MONTH_START}, plus prorated Rent for the partial first "
     "month{/IS_MID_MONTH_START}.")
term("Payments", "All Rent is paid electronically by automatic payment through the management company’s tenant portal.")
term("Condition of Premises", "Tenant accepts the premises in their “as is” condition. Any alterations or improvements are "
     "at Tenant’s cost and require Landlord’s prior written approval.")
term("Renewal Option", "{#HAS_RENEWAL_OPTION}One option to renew for {{RENEWAL_YEARS}} additional years starting on "
     "{{RENEWAL_START_DATE}}, on the conditions stated in the Lease.{/HAS_RENEWAL_OPTION}"
     "{^HAS_RENEWAL_OPTION}None.{/HAS_RENEWAL_OPTION}")
term("Personal Guaranty", "{#HAS_GUARANTORS}Tenant’s obligations will be personally guaranteed by {{GUARANTOR_1_NAME}}"
     "{#HAS_SECOND_GUARANTOR} and {{GUARANTOR_2_NAME}}{/HAS_SECOND_GUARANTOR}.{/HAS_GUARANTORS}"
     "{^HAS_GUARANTORS}None required.{/HAS_GUARANTORS}")
term("Additional Terms", "{#HAS_CUSTOM_PROVISIONS}{{CUSTOM_PROVISIONS}}{/HAS_CUSTOM_PROVISIONS}"
     "{^HAS_CUSTOM_PROVISIONS}None.{/HAS_CUSTOM_PROVISIONS}")
term("Not Binding", "This letter is an expression of intent only. It is not a lease, an offer to lease, or an agreement to "
     "negotiate, and it creates no obligation on either party. Neither party is bound unless and until a Lease is signed "
     "and delivered by both Landlord and Tenant, and Landlord may continue to market the premises until then. Any Lease is "
     "subject to Landlord’s approval of Tenant’s application and financial information.")
term("Expiration", "This proposal expires if it is not signed by Tenant on or before {{LOI_EXPIRES}}.")

para("")
para(("ACKNOWLEDGED (NON-BINDING):", "b"), space_after=10)
para(("TENANT: ", "b"), "{{TENANT_LEGAL_NAME}}", space_after=12)
para("By: ", ("\\s1\\", "w"), "______________________________", space_after=2)
para("Name: {{TENANT_SIGNER_NAME}}     Title: {{TENANT_SIGNER_TITLE}}", space_after=2)
para("Date: ", ("\\d1\\", "w"), "______________________", space_after=16)
para(("LANDLORD: ", "b"), "Bluewater Corporate Center, LLC", space_after=12)
para("By: ", ("\\s2\\", "w"), "______________________________", space_after=2)
para("Name: {{LANDLORD_SIGNER_NAME}}     Title: {{LANDLORD_SIGNER_TITLE}}", space_after=2)
para("Date: ", ("\\d2\\", "w"), "______________________")

d.save(sys.argv[1])
print("ok", sys.argv[1])
