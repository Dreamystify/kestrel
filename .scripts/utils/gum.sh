#!/bin/sh

########################
# Display a spinning loader
# Arguments:
#   $1 - Loading message
#   $@ - Command to execute
# Returns:
#   The exit status of the executed command
# Example Usage: gum_spin "Spin for 1 second" sleep 1
########################
gum_spin() {
  local message=$1
  shift
  gum spin -s line --title "$message" -- "$@"
  # Available spinner types include: line, dot, minidot, jump, pulse, points, globe, moon, monkey, meter, hamburger.
}

########################
# Display a confirmation dialog
# Arguments:
#   $1 - Confirmation message
#   $2 - (Optional) Affirmative text (default: "Yes")
#   $3 - (Optional) Negative text (default: "No")
#   $@ - Command to execute if confirmed
# Returns:
#   The exit status of the executed command if confirmed, otherwise 1
########################
gum_confirm() {
  local message="$1"
  shift

  # Default values
  local affirmative_text="Yes"
  local negative_text="No"

  # Check if affirmative and negative texts are provided
  if [ "$#" -ge 2 ]; then
    affirmative_text="$1"
    negative_text="$2"
    shift 2
  fi

  # Execute gum confirm with the appropriate texts and command
  gum confirm --affirmative="$affirmative_text" --negative="$negative_text" -- "$message" && "$@"
}

########################
# Display a prompt with a list of options
# Arguments:
#   $1 - Header message
#   $@ - List of options
# Returns:
#   The selected option
# Example Usage: gum_choose "Please select an option:" "option 1" "option 2" "option 3"
########################
gum_choose() {
  local header=$1
  shift
  gum choose --limit 1 --header "$header" -- "$@"
}

########################
# Display logging information
# Arguments:
#   $1 - Log level (e.g., "info", "debug", "warn", "error", "fatal")
#   $2 - Log message
#   $@ - Additional arguments
# Returns:
#   None
########################
gum_log() {
  local valid_levels=("none" "debug" "info" "warn" "error" "fatal")
  local level
  local message

  if [[ " ${valid_levels[*]} " == *" $1 "* ]]; then
    level="$1"
    shift
    message="$1"
    shift
  else
    level="info"
    message="$1"
    shift
  fi

  gum log --structured --level "$level" -- "$message" "$@"
}

########################
# Display a message with a specific style
# Arguments:
#   $1 - Message to style
#   $@ - Additional gum style arguments
# Returns:
#   None
# Example usage:
#   gum_style "Your styled message" --foreground 46 --border-foreground 46 --border double --align center --width 50 --margin "1 2" --padding "2 4"
#   gum_style "Another message" --background 234 --bold --underline
########################
gum_style() {
  local message=$1
  shift

  gum style "$message" "$@"
}

########################
# Format text using gum format
# Arguments:
#   $@ - Text to format
# Returns:
#   None
########################
gum_format() {
  gum format -- "$@"
}

########################
# Display an input prompt with a placeholder and optionally a default value
# Arguments:
#   $1 - Default value for the input (optional)
#   $2 - Placeholder for the input
# Returns:
#   The entered input
# Example usage:
#   # Prompt with just a placeholder
#   scope=$(gum_input "scope")
#   echo "Scope: $scope"
#
#   # Prompt with a default value and a placeholder
#   summary=$(gum_input "$TYPE$SCOPE: " "Summary of this change")
#   echo "Summary: $summary"
########################
gum_input() {
  local value=""
  local placeholder=""

  if [ $# -eq 1 ]; then
    placeholder=$1
    gum input --placeholder "$placeholder"
  elif [ $# -eq 2 ]; then
    value=$1
    placeholder=$2
    gum input --value "$value" --placeholder "$placeholder"
  else
    echo "Invalid number of arguments. Usage: gum_input [default_value] placeholder"
    return 1
  fi
}

########################
# Display a text area for detailed input with a placeholder
# Arguments:
#   $1 - Placeholder for the text area
# Returns:
#   The entered text
# Example usage:
#   details=$(gum_write "Details of this change")
#   echo "Details: $details"
########################
gum_write() {
  local placeholder=$1
  gum write --placeholder "$placeholder"
}