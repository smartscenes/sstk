class AnnotationVerifyDialog {
  create() {
    return $(`
			<div id="antn-dialog">
				<div id="antn-dialog-title">Is this annotation correct?</div>
				<div id="antn-dialog-content">
					<div class="antn-dialog-section">
						<div class="antn-dialog-option splay-option">
							<label>Yes</label>
							<input id="yes" type="radio" name="antn">
						</div>
					</div>
					<div class="antn-dialog-section">
						<div class="antn-dialog-option splay-option">
							<label>Yes, but the range is wrong</label>
							<input id="yes-but-range" type="radio" name="antn">
						</div>
						<div class="range-container"></div>
					</div>
					<div class="antn-dialog-section">
						<div class="antn-dialog-option splay-option">
							<label>No</label>
							<input id="no" type="radio" name="antn">
						</div>
					</div>
					<div class="antn-dialog-section">
						<div class="antn-dialog-option splay-option">
							<label>No, axis is wrong</label>
							<input id="no-axis" type="radio" name="antn">
						</div>
					</div>
					<div class="antn-dialog-section">
						<div class="antn-dialog-option splay-option">
							<label>No, type is wrong</label>
							<input id="no-type" type="radio" name="antn">
						</div>
					</div>
					<div class="antn-dialog-section">
						<div class="antn-dialog-option splay-option">
							<label>No, this part is not articulated</label>
							<input id="no-not-articulated" type="radio" name="antn">
						</div>
					</div>
          <div class="antn-dialog-section">
						<div class="antn-dialog-option splay-option">
							<label>No, there is a problem with this part.</label>
							<input id="problem" type="radio" name="antn">
						</div>
					</div>

				</div>
				<div id="antn-dialog-buttons">
					<div class="antn-dialog-button" id="submit">Submit</div>
				</div>
			</div>`);
  }
}